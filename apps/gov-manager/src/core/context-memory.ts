export interface MemoryChunkRow {
  memory_id: string;
  chunk_id: string;
  namespace: string;
  topic: string;
  content: string;
  summary: string;
  tags: string[];
  mission_id?: string;
  role?: string;
  actor?: string;
  source_type: string;
  score_hint?: number;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface ContextMemoryState {
  version: "1.0";
  updated_at_utc: string;
  rows: MemoryChunkRow[];
}

function nowUtc(): string {
  return new Date().toISOString();
}

function clampText(value: unknown, max: number): string {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function normalizeIso(value: unknown): string {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : nowUtc();
}

function normalizeToken(value: unknown, max = 60): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

function dedupeTags(values: unknown): string[] {
  const source = Array.isArray(values) ? values : String(values || "").split(/[;,\n]/g);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of source) {
    const clean = normalizeToken(item, 48);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out.slice(0, 24);
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9à-ÿ._:-]+/gi, " ")
        .split(/\s+/g)
        .map((item) => item.trim())
        .filter((item) => item.length >= 3)
    )
  ).slice(0, 128);
}

function chunkText(text: string, maxLen = 900): string[] {
  const clean = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/g).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs.length > 0 ? paragraphs : [clean]) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= maxLen) {
      current = paragraph;
      continue;
    }
    for (let idx = 0; idx < paragraph.length; idx += maxLen) {
      chunks.push(paragraph.slice(idx, idx + maxLen));
    }
    current = "";
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 64);
}

export function defaultContextMemoryState(): ContextMemoryState {
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: []
  };
}

export function sanitizeContextMemoryState(input: unknown): ContextMemoryState {
  if (!input || typeof input !== "object") return defaultContextMemoryState();
  const obj = input as Record<string, unknown>;
  const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
  const rows = rowsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const memoryId = normalizeToken(row.memory_id, 120);
      const chunkId = normalizeToken(row.chunk_id, 120);
      const namespace = normalizeToken(row.namespace, 80);
      const topic = clampText(row.topic, 180);
      const content = clampText(row.content, 4000);
      if (!memoryId || !chunkId || !namespace || !topic || !content) return null;
      return {
        memory_id: memoryId,
        chunk_id: chunkId,
        namespace,
        topic,
        content,
        summary: clampText(row.summary, 600) || content.slice(0, 240),
        tags: dedupeTags(row.tags),
        ...(normalizeToken(row.mission_id, 120) ? { mission_id: String(row.mission_id).trim().toUpperCase() } : {}),
        ...(normalizeToken(row.role, 40) ? { role: normalizeToken(row.role, 40).toUpperCase() } : {}),
        ...(clampText(row.actor, 120) ? { actor: clampText(row.actor, 120) } : {}),
        source_type: normalizeToken(row.source_type, 40) || "udn",
        ...(Number.isFinite(Number(row.score_hint)) ? { score_hint: Math.max(0, Math.min(100, Math.trunc(Number(row.score_hint)))) } : {}),
        created_at_utc: normalizeIso(row.created_at_utc),
        updated_at_utc: normalizeIso(row.updated_at_utc)
      } satisfies MemoryChunkRow;
    })
    .filter((row): row is MemoryChunkRow => Boolean(row))
    .sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)))
    .slice(0, 5000);

  return {
    version: "1.0",
    updated_at_utc: normalizeIso(obj.updated_at_utc),
    rows
  };
}

export function upsertMemoryRows(state: ContextMemoryState, rows: MemoryChunkRow[]): ContextMemoryState {
  const map = new Map(state.rows.map((row) => [`${row.memory_id}:${row.chunk_id}`, row] as const));
  for (const row of rows) map.set(`${row.memory_id}:${row.chunk_id}`, row);
  return sanitizeContextMemoryState({
    ...state,
    updated_at_utc: nowUtc(),
    rows: Array.from(map.values())
  });
}

export function createMemoryId(namespace: string, topic: string): string {
  return `${normalizeToken(namespace, 40)}-${normalizeToken(topic, 60)}-${Date.now()}`;
}

export function buildMemoryRows(input: {
  namespace: string;
  topic: string;
  content: string;
  summary?: string;
  tags?: unknown;
  mission_id?: string;
  role?: string;
  actor?: string;
  source_type?: string;
  memory_id?: string;
}): MemoryChunkRow[] {
  const namespace = normalizeToken(input.namespace, 80);
  const topic = clampText(input.topic, 180);
  const content = clampText(input.content, 16000);
  if (!namespace || !topic || !content) return [];
  const memoryId = normalizeToken(input.memory_id, 120) || createMemoryId(namespace, topic);
  const chunks = chunkText(content);
  const createdAt = nowUtc();
  const tags = dedupeTags(input.tags);
  return chunks.map((chunk, index) => ({
    memory_id: memoryId,
    chunk_id: `${memoryId}-${index + 1}`,
    namespace,
    topic,
    content: chunk,
    summary: clampText(input.summary, 600) || chunk.slice(0, 240),
    tags,
    ...(normalizeToken(input.mission_id, 120) ? { mission_id: String(input.mission_id).trim().toUpperCase() } : {}),
    ...(normalizeToken(input.role, 40) ? { role: normalizeToken(input.role, 40).toUpperCase() } : {}),
    ...(clampText(input.actor, 120) ? { actor: clampText(input.actor, 120) } : {}),
    source_type: normalizeToken(input.source_type, 40) || "udn",
    created_at_utc: createdAt,
    updated_at_utc: createdAt
  }));
}

export function searchMemory(state: ContextMemoryState, input: {
  query?: string;
  namespace?: string;
  mission_id?: string;
  role?: string;
  tags?: unknown;
  limit?: number;
}): MemoryChunkRow[] {
  const query = clampText(input.query, 300);
  const namespace = normalizeToken(input.namespace, 80);
  const missionId = normalizeToken(input.mission_id, 120).toUpperCase();
  const role = normalizeToken(input.role, 40).toUpperCase();
  const tags = dedupeTags(input.tags);
  const queryTerms = tokenize(query);
  const now = Date.now();
  const scored = state.rows
    .filter((row) => {
      if (namespace && row.namespace !== namespace) return false;
      if (missionId && String(row.mission_id || "") !== missionId) return false;
      if (role && String(row.role || "") !== role) return false;
      if (tags.length > 0 && !tags.some((tag) => row.tags.includes(tag))) return false;
      return true;
    })
    .map((row) => {
      let score = 0;
      if (namespace && row.namespace === namespace) score += 25;
      if (missionId && row.mission_id === missionId) score += 30;
      if (role && row.role === role) score += 10;
      if (tags.length > 0) score += tags.filter((tag) => row.tags.includes(tag)).length * 8;
      const haystack = `${row.topic} ${row.summary} ${row.content} ${row.tags.join(" ")}`.toLowerCase();
      for (const term of queryTerms) {
        if (haystack.includes(term)) score += 6;
      }
      const ageHours = Math.max(0, Math.round((now - Date.parse(row.updated_at_utc)) / 3600000));
      score += Math.max(0, 12 - Math.min(ageHours, 12));
      if (Number.isFinite(Number(row.score_hint))) score += Math.round(Number(row.score_hint) / 10);
      return { row, score };
    })
    .filter((item) => item.score > 0 || (!query && !namespace && !missionId && !role && tags.length === 0))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.row.updated_at_utc).localeCompare(String(a.row.updated_at_utc));
    })
    .slice(0, Math.max(1, Math.min(20, Number(input.limit) || 5)));

  return scored.map((item) => item.row);
}
