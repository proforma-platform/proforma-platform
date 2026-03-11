import { createHash } from "crypto";

export interface PromptEntry {
  prompt_id: string;
  title: string;
  type: string;
  description: string;
  purpose: string;
  tags: string[];
  template: string;
  variables: string[];
  prompt_hash: string;
  created_by: string;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface PromptLibraryState {
  prompts: PromptEntry[];
  updated_at_utc: string;
}

export interface PromptInput {
  prompt_id?: string;
  title: string;
  type?: string;
  description?: string;
  purpose?: string;
  tags?: string[];
  template: string;
  variables?: string[];
  created_by: string;
}

export function defaultPromptLibraryState(): PromptLibraryState {
  return {
    prompts: [],
    updated_at_utc: new Date().toISOString()
  };
}

export function sanitizePromptLibraryState(input: unknown): PromptLibraryState {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const raw = Array.isArray(obj.prompts) ? obj.prompts : [];
  const prompts = raw
    .filter((p) => p && typeof p === "object")
    .map((p) => sanitizePromptEntry(p as Record<string, unknown>))
    .filter((p): p is PromptEntry => p !== null);

  return {
    prompts,
    updated_at_utc: typeof obj.updated_at_utc === "string" ? obj.updated_at_utc : new Date().toISOString()
  };
}

export function upsertPrompt(state: PromptLibraryState, input: PromptInput): { state: PromptLibraryState; prompt: PromptEntry } {
  const now = new Date().toISOString();
  const prompt_id = normalizePromptId(input.prompt_id || slugify(input.title) || `prompt-${Date.now().toString(36)}`);
  const template = String(input.template || "").trim();
  const variables = normalizeVariables(input.variables && input.variables.length > 0 ? input.variables : extractTemplateVariables(template));
  const entry: PromptEntry = {
    prompt_id,
    title: String(input.title || prompt_id).trim().slice(0, 120),
    type: String(input.type || "mission").trim().slice(0, 40) || "mission",
    description: String(input.description || "").trim().slice(0, 240),
    purpose: String(input.purpose || "").trim().slice(0, 240),
    tags: normalizeTags(input.tags || []),
    template,
    variables,
    prompt_hash: hashTemplate(template),
    created_by: String(input.created_by || "staff@gov-manager").trim(),
    created_at_utc: now,
    updated_at_utc: now
  };

  const existing = state.prompts.find((p) => p.prompt_id === prompt_id);
  if (existing) {
    entry.created_at_utc = existing.created_at_utc;
    entry.created_by = existing.created_by;
  }

  const next = state.prompts.filter((p) => p.prompt_id !== prompt_id);
  next.unshift(entry);

  return {
    prompt: entry,
    state: {
      prompts: next,
      updated_at_utc: now
    }
  };
}

export function removePrompt(state: PromptLibraryState, promptId: string): PromptLibraryState {
  return {
    prompts: state.prompts.filter((p) => p.prompt_id !== promptId),
    updated_at_utc: new Date().toISOString()
  };
}

export function renderPromptTemplate(template: string, variables: Record<string, string>): string {
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_\-\.]+)\s*\}\}/g, (_, key: string) => {
    const v = variables[key];
    return typeof v === "string" ? v : "";
  });
}

export function extractTemplateVariables(template: string): string[] {
  const vars = new Set<string>();
  const regex = /\{\{\s*([a-zA-Z0-9_\-\.]+)\s*\}\}/g;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = regex.exec(template);
    if (!match) break;
    const key = match[1];
    if (key) vars.add(key);
  }
  return [...vars];
}

export function hashTemplate(template: string): string {
  return createHash("sha256").update(Buffer.from(template, "utf8")).digest("hex");
}

function sanitizePromptEntry(input: Record<string, unknown>): PromptEntry | null {
  const prompt_id = normalizePromptId(String(input.prompt_id || "").trim());
  const template = String(input.template || "").trim();
  if (!prompt_id || !template) return null;
  const variables = normalizeVariables(
    Array.isArray(input.variables)
      ? input.variables.map((v) => String(v))
      : extractTemplateVariables(template)
  );

  return {
    prompt_id,
    title: String(input.title || prompt_id).trim().slice(0, 120),
    type: String(input.type || "mission").trim().slice(0, 40) || "mission",
    description: String(input.description || "").trim().slice(0, 240),
    purpose: String(input.purpose || "").trim().slice(0, 240),
    tags: normalizeTags(Array.isArray(input.tags) ? input.tags.map((t) => String(t)) : []),
    template,
    variables,
    prompt_hash: typeof input.prompt_hash === "string" ? input.prompt_hash : hashTemplate(template),
    created_by: String(input.created_by || "staff@gov-manager").trim(),
    created_at_utc: String(input.created_at_utc || new Date().toISOString()),
    updated_at_utc: String(input.updated_at_utc || new Date().toISOString())
  };
}

function normalizePromptId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

function normalizeVariables(vars: string[]): string[] {
  return [...new Set(vars.map((v) => v.trim()).filter(Boolean))].slice(0, 32);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
