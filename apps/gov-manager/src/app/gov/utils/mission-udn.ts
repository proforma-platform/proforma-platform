export function sanitizeMissionInline(value: string): string {
  return String(value || "")
    .replace(/\r?\n/g, " ")
    .replace(/[;|]/g, ",")
    .trim();
}

export function missionRequiredIssues(
  mission: { id: string; target: string },
  createdBy: string,
  parts: Array<{ goal: string }>
): string[] {
  const issues: string[] = [];
  if (!String(mission.id || "").trim()) issues.push("Mission ID");
  if (!String(mission.target || "").trim()) issues.push("Objetivo");
  if (!String(createdBy || "").trim()) issues.push("Criado por");
  const hasPartGoal = parts.some((part) => String(part.goal || "").trim().length > 0);
  if (!hasPartGoal) issues.push("Entrega da Parte");
  return issues;
}

export function normalizeTdvTags(raw: string): string {
  return String(raw || "")
    .replace(/#\s*mu\s*:/gi, "#μ:")
    .replace(/#\s*tau\s*:/gi, "#τ:")
    .replace(/#\s*sigma\s*:/gi, "#σ:")
    .replace(/#\s*rho\s*:/gi, "#ρ:")
    .replace(/#\s*delta\s*:/gi, "#δ:");
}

export function udnContractIssues(rawUdn: string): string[] {
  const text = normalizeTdvTags(String(rawUdn || "")).trim().toUpperCase();
  const issues: string[] = [];
  if (!text) issues.push("UDN vazio");
  if (text && !text.includes("!MIS|")) issues.push("!MIS");
  if (text && !text.includes("#Μ:")) issues.push("#μ");
  return issues;
}

export function repairMissionUdn(rawUdn: string, generatedUdn: string): { udn: string; repaired: string[] } {
  const rawLines = normalizeTdvTags(String(rawUdn || ""))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const generatedLines = normalizeTdvTags(String(generatedUdn || ""))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const repaired: string[] = [];
  const ensureLine = (prefix: string) => {
    const hasPrefix = rawLines.some((line) => line.toUpperCase().startsWith(prefix.toUpperCase()));
    if (hasPrefix) return;
    const fallback = generatedLines.find((line) => line.toUpperCase().startsWith(prefix.toUpperCase()));
    if (fallback) {
      rawLines.push(fallback);
      repaired.push(prefix);
    }
  };

  ensureLine("!MIS|");
  ensureLine("#μ:");
  if (rawLines.some((line) => line.toUpperCase().startsWith("!MIS|")) && !rawLines.some((line) => line.toUpperCase().startsWith("#τ:"))) {
    ensureLine("#τ:");
  }

  return { udn: normalizeTdvTags(rawLines.join("\n")), repaired };
}

export function missionShortToken(value: string, missionIdDigits: number): string {
  const clean = String(value || "").trim().toUpperCase();
  const match = clean.match(/-(\d{1,10})$/);
  if (!match || !match[1]) return clean || "00001";
  return match[1].padStart(missionIdDigits, "0");
}

export function parseRequestAndNotes(raw: string): { requestText: string; notesText: string } {
  const text = String(raw || "").trim();
  if (!text) return { requestText: "", notesText: "" };
  const requestMatch = text.match(/Solicitação:\s*([\s\S]*?)(?:\n\s*Notas:\s*|$)/i);
  const notesMatch = text.match(/\n\s*Notas:\s*([\s\S]*)$/i);
  if (requestMatch || notesMatch) {
    return {
      requestText: String(requestMatch?.[1] || "").trim(),
      notesText: String(notesMatch?.[1] || "").trim()
    };
  }
  return { requestText: "", notesText: text };
}

export function composeCompactMissionUdn(missionId: string, objective: string, missionIdDigits: number): string {
  const token = missionShortToken(missionId || "00001", missionIdDigits);
  const mu = sanitizeMissionInline(objective || "Missão registrada no GOV-HUB.") || "Missão registrada no GOV-HUB.";
  return `!MIS|${token}\n#μ:${mu}`;
}

export function isLowSignalRequest(value: string): boolean {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return true;
  if (normalized.length < 12) return true;
  if (normalized.startsWith("resultado factual |")) return true;
  if (normalized.startsWith("missao_recebida |")) return true;
  if (normalized.includes(" queue=") && normalized.includes(" session=") && normalized.includes(" trace=") && normalized.includes(" run=")) return true;
  return (
    normalized === "classificar escopo e preparar distribuicao inicial." ||
    normalized === "classificar escopo e preparar distribuicao inicial"
  );
}

export function mergeMissionUdnWithRequest(
  udnText: string,
  missionId: string,
  requestText: string,
  missionIdDigits: number
): string {
  const request = sanitizeMissionInline(String(requestText || "").trim());
  if (!request) return String(udnText || "").trim();
  const base = String(udnText || "").trim();
  if (!base) return composeCompactMissionUdn(missionId, request, missionIdDigits);
  const lines = base.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const hasMu = lines.some((line) => /^#μ:/i.test(line));
  const next = lines.map((line) => {
    if (!/^#μ:/i.test(line)) return line;
    const current = line.replace(/^#μ:\s*/i, "").trim();
    if (!isLowSignalRequest(current)) return line;
    return `#μ:${request}`;
  });
  if (!hasMu) next.push(`#μ:${request}`);
  return next.join("\n");
}

export function extractUdnMu(rawInput: string): string {
  const normalized = normalizeTdvTags(String(rawInput || "")).trim();
  const idx = normalized.indexOf("!MIS|");
  const text = idx >= 0 ? normalized.slice(idx).trim() : normalized;
  if (!text) return "";
  const match = text.match(/#μ:\s*([^\n]+)/i);
  return String(match?.[1] || "").trim();
}

export function extractUdnPartGoals(rawInput: string): string[] {
  const normalized = normalizeTdvTags(String(rawInput || "")).trim();
  const idx = normalized.indexOf("!MIS|");
  const text = idx >= 0 ? normalized.slice(idx).trim() : normalized;
  if (!text) return [];
  const goals = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#part:/i.test(line))
    .map((line) => {
      const body = line.replace(/^#part:/i, "").trim();
      const fields = body.split(";").map((field) => field.trim());
      const goalField = fields.find((field) => /^goal=/i.test(field));
      return String(goalField || "")
        .replace(/^goal=/i, "")
        .trim();
    })
    .filter(Boolean);
  return Array.from(new Set(goals));
}

export function buildPrimaryRequestFromUdn(rawInput: string): string {
  const goals = extractUdnPartGoals(rawInput);
  if (goals.length > 0) return goals.join("\n");
  return extractUdnMu(rawInput);
}
