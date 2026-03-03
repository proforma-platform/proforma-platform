'use client';

import { useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light";
type Section = "visao" | "missoes" | "execucoes" | "pendencias" | "prompts" | "governanca";
type PartExecutor = "STAFF" | "CPP" | "CPP-IA";
type PartPriority = "P0" | "P1" | "P2";

interface MissionPart {
  part_id: string;
  goal: string;
  executor: PartExecutor;
  priority: PartPriority;
}

interface PromptEntry {
  prompt_id: string;
  title: string;
  description: string;
  purpose: string;
  tags: string[];
  template: string;
  variables: string[];
  prompt_hash: string;
}

interface TokenPolicy {
  daily_token_limit: number;
  daily_usd_limit: number;
  monthly_usd_limit: number;
  warn_threshold_pct: number;
  auto_pause_on_limit: boolean;
  hard_stop: boolean;
}

const defaultPolicy: TokenPolicy = {
  daily_token_limit: 60000,
  daily_usd_limit: 12,
  monthly_usd_limit: 240,
  warn_threshold_pct: 80,
  auto_pause_on_limit: true,
  hard_stop: true
};

function resolveOwnerAckRequired(payload: unknown): boolean {
  const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  if (obj.owner_ack_required === true) return true;
  const upstream = (obj.govhub_response && typeof obj.govhub_response === "object"
    ? obj.govhub_response
    : {}) as Record<string, unknown>;
  return upstream.owner_ack_required === true;
}

function parseVars(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export default function GovManagerPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [section, setSection] = useState<Section>("visao");

  const [mission, setMission] = useState({ id: "", target: "", branch: "main", agent_id: "CPP" });
  const [createdBy, setCreatedBy] = useState("staff@gov-manager");
  const [udn, setUdn] = useState("");
  const [status, setStatus] = useState("idle");
  const [responseText, setResponseText] = useState("");
  const [ackRequired, setAckRequired] = useState(false);
  const [ownerNote, setOwnerNote] = useState("");

  const [tokenControl, setTokenControl] = useState({
    enabled: true,
    budget_usd: 5,
    budget_brl: 26,
    max_input_tokens: 6000,
    max_output_tokens: 6000,
    hard_stop: true
  });
  const [tokenPreview, setTokenPreview] = useState("");
  const [tokenRealtime, setTokenRealtime] = useState("");

  const [parts, setParts] = useState<MissionPart[]>([
    {
      part_id: "P1",
      goal: "Classificar escopo e preparar distribuicao inicial.",
      executor: "STAFF",
      priority: "P0"
    }
  ]);

  const [promptLibrary, setPromptLibrary] = useState<PromptEntry[]>([]);
  const [promptForm, setPromptForm] = useState({ title: "", description: "", purpose: "", tags: "", template: "" });
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [promptVarsRaw, setPromptVarsRaw] = useState("contexto=govhub\nobjetivo=reduzir tokens");

  const [policy, setPolicy] = useState<TokenPolicy>(defaultPolicy);
  const [usageText, setUsageText] = useState("");

  const selectedPrompt = useMemo(
    () => promptLibrary.find((prompt) => prompt.prompt_id === selectedPromptId) || null,
    [promptLibrary, selectedPromptId]
  );

  useEffect(() => {
    const persisted = window.localStorage.getItem("gov-manager-theme");
    const next = persisted === "light" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  useEffect(() => {
    loadPrompts();
    loadPolicy();
  }, []);

  useEffect(() => {
    if (!createdBy) return;
    let active = true;

    const pullUsage = async () => {
      try {
        const response = await fetch(`/api/govhub/token/usage?owner_id=${encodeURIComponent(createdBy)}`, {
          cache: "no-store"
        });
        const payload = await response.json();
        if (active) setUsageText(JSON.stringify(payload, null, 2));
      } catch {
        if (active) setUsageText(JSON.stringify({ status: "error", error_code: "USAGE_FETCH_FAILED" }, null, 2));
      }
    };

    pullUsage();
    const interval = window.setInterval(pullUsage, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [createdBy]);

  async function loadPrompts() {
    try {
      const response = await fetch("/api/govhub/prompts", { cache: "no-store" });
      const payload = await response.json();
      if (Array.isArray(payload.prompts)) setPromptLibrary(payload.prompts);
    } catch {
      // no-op
    }
  }

  async function savePrompt() {
    setStatus("saving_prompt");
    try {
      const response = await fetch("/api/govhub/prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          created_by: createdBy,
          prompt: {
            title: promptForm.title,
            description: promptForm.description,
            purpose: promptForm.purpose,
            tags: promptForm.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            template: promptForm.template
          }
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      await loadPrompts();
      setPromptForm({ title: "", description: "", purpose: "", tags: "", template: "" });
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "PROMPT_SAVE_FAILED" }, null, 2));
    }
  }

  async function deletePrompt(promptId: string) {
    setStatus("deleting_prompt");
    try {
      const response = await fetch("/api/govhub/prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", prompt_id: promptId, created_by: createdBy })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      if (selectedPromptId === promptId) setSelectedPromptId("");
      await loadPrompts();
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "PROMPT_DELETE_FAILED" }, null, 2));
    }
  }

  async function loadPolicy() {
    try {
      const response = await fetch("/api/govhub/token/policy", { cache: "no-store" });
      const payload = await response.json();
      if (payload?.policy?.default_policy) {
        setPolicy(payload.policy.default_policy as TokenPolicy);
      }
    } catch {
      // no-op
    }
  }

  async function savePolicy() {
    setStatus("saving_policy");
    try {
      const response = await fetch("/api/govhub/token/policy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          updated_by: createdBy,
          policy: {
            default_policy: policy,
            owner_overrides: [],
            updated_at_utc: new Date().toISOString()
          }
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "POLICY_SAVE_FAILED" }, null, 2));
    }
  }

  function updateTheme(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("gov-manager-theme", next);
  }

  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/login";
  }

  function compileUdn() {
    const safe = (value: string) =>
      String(value || "")
        .replace(/\r?\n/g, " ")
        .replace(/[;|]/g, ",")
        .trim();

    const promptRefLine = selectedPrompt
      ? `#ctx_prompt_ref:id=${selectedPrompt.prompt_id};hash=${selectedPrompt.prompt_hash}`
      : "#ctx_prompt_ref:none";

    const lines = [
      `!MIS|${mission.id || "SEM_ID"}|PLAN|REGISTRAR`,
      `#mu:${mission.target || "Registrar missao no GOV-HUB."}`,
      promptRefLine,
      "#staff:classificar;particionar;distribuir",
      ...parts.map(
        (part, index) =>
          `#part:${safe(part.part_id || `P${index + 1}`)};exec=${part.executor};prio=${part.priority};goal=${safe(
            part.goal || "definir entrega"
          )}`
      ),
      "#tau:registrar_missao;monitorar_execucao",
      "#sigma:READY",
      "!OUT:JSON_ONLY.NO_MD.NO_TXT."
    ];
    setUdn(lines.join("\n"));
  }

  function addPart() {
    setParts((prev) => [
      ...prev,
      {
        part_id: `P${prev.length + 1}`,
        goal: "",
        executor: "CPP",
        priority: "P1"
      }
    ]);
  }

  function updatePart(index: number, patch: Partial<MissionPart>) {
    setParts((prev) => prev.map((part, i) => (i === index ? { ...part, ...patch } : part)));
  }

  function removePart(index: number) {
    setParts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function registerMission() {
    setStatus("sending");
    try {
      const response = await fetch("/api/govhub/missions/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          udn,
          mission,
          created_by: createdBy,
          token_control: tokenControl,
          parts,
          ...(selectedPrompt
            ? {
                prompt_ref: {
                  prompt_id: selectedPrompt.prompt_id,
                  prompt_hash: selectedPrompt.prompt_hash,
                  inject_mode: "append_ref",
                  variables: parseVars(promptVarsRaw)
                }
              }
            : {})
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setAckRequired(resolveOwnerAckRequired(payload));
      setStatus(response.ok ? "success" : "error");
      setSection("execucoes");
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "NETWORK_ERROR" }, null, 2));
    }
  }

  async function estimateCost() {
    setStatus("token_preview");
    try {
      const response = await fetch("/api/govhub/missions/cost-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          udn,
          mission,
          created_by: createdBy,
          token_control: tokenControl,
          parts,
          ...(selectedPrompt
            ? {
                prompt_ref: {
                  prompt_id: selectedPrompt.prompt_id,
                  prompt_hash: selectedPrompt.prompt_hash,
                  inject_mode: "append_ref",
                  variables: parseVars(promptVarsRaw)
                }
              }
            : {})
        })
      });
      const payload = await response.json();
      setTokenPreview(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      setSection("execucoes");
    } catch {
      setStatus("error");
      setTokenPreview(JSON.stringify({ status: "error", error_code: "TOKEN_PREVIEW_NETWORK_ERROR" }, null, 2));
    }
  }

  useEffect(() => {
    if (!mission.id || !udn) return;
    let active = true;
    const tick = async () => {
      try {
        const qs = new URLSearchParams({
          mission_id: mission.id,
          agent_id: mission.agent_id,
          udn,
          objective: mission.target,
          owner_id: createdBy,
          token_control: JSON.stringify(tokenControl)
        });
        const response = await fetch(`/api/govhub/missions/token-monitor?${qs.toString()}`, { cache: "no-store" });
        const payload = await response.json();
        if (active) setTokenRealtime(JSON.stringify(payload, null, 2));
      } catch {
        if (active) {
          setTokenRealtime(JSON.stringify({ status: "error", error_code: "TOKEN_MONITOR_NETWORK_ERROR" }, null, 2));
        }
      }
    };
    tick();
    const interval = window.setInterval(tick, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [createdBy, mission.id, mission.agent_id, mission.target, tokenControl, udn]);

  async function ownerAck(decision: "approve" | "deny") {
    setStatus("owner_ack");
    try {
      const response = await fetch("/api/govhub/missions/owner-ack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mission_id: mission.id,
          decision,
          owner_id: createdBy,
          note: ownerNote
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setStatus(response.ok ? "success" : "error");
      if (response.ok && decision === "approve") setAckRequired(false);
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "NETWORK_ERROR" }, null, 2));
    }
  }

  const metrics = useMemo(
    () => [
      { label: "Missoes", value: mission.id ? "1 ativa" : "0" },
      { label: "Status", value: status.toUpperCase() },
      { label: "Partes", value: String(parts.length) },
      { label: "Prompt", value: selectedPrompt ? selectedPrompt.prompt_id : "-" },
      { label: "Agente", value: mission.agent_id },
      { label: "Token Ctrl", value: tokenControl.enabled ? "ON" : "OFF" }
    ],
    [mission.agent_id, mission.id, parts.length, selectedPrompt, status, tokenControl.enabled]
  );

  const pendingItems = useMemo(() => {
    const list: string[] = [];
    if (!udn.trim()) list.push("Gerar UDN antes de registrar.");
    if (!mission.id.trim()) list.push("Definir Mission ID.");
    if (ackRequired) list.push("Missao aguardando aprovacao do owner.");
    if (status === "error") list.push("Existe erro operacional pendente no ultimo ciclo.");
    if (list.length === 0) list.push("Sem pendencias criticas neste momento.");
    return list;
  }, [ackRequired, mission.id, status, udn]);

  const pageTitle = useMemo(() => {
    if (section === "missoes") return "Missões";
    if (section === "execucoes") return "Execuções";
    if (section === "pendencias") return "Pendências";
    if (section === "prompts") return "Biblioteca de Prompts";
    if (section === "governanca") return "Governança de Tokens";
    return "Visão geral";
  }, [section]);

  const pageSubtitle = useMemo(() => {
    if (section === "missoes") return "Cadastro de missão, particionamento e envio ao HUB.";
    if (section === "execucoes") return "Monitoramento operacional e retorno de execução.";
    if (section === "pendencias") return "Itens que exigem ação para manter fluxo contínuo.";
    if (section === "prompts") return "Reuso por referência para reduzir custo de tokens.";
    if (section === "governanca") return "Política de limites, alertas e consumo em tempo real.";
    return "Painel oficial do GOV-HUB com operação direta e responsiva.";
  }, [section]);

  return (
    <main className="gm-shell">
      <aside className="gm-sidebar">
        <div className="gm-brand">
          <img className="gm-brand-seal" src="/selo-govhub.png" alt="Selo Gov-Hub" />
          <div className="gm-brand-copy">
            <strong className="gm-brand-title">Gov-Hub</strong>
            <span className="gm-brand-subtitle">Manager Oficial</span>
          </div>
        </div>

        <nav>
          <button className={section === "visao" ? "active" : ""} onClick={() => setSection("visao")}>Visão geral</button>
          <button className={section === "missoes" ? "active" : ""} onClick={() => setSection("missoes")}>Missões</button>
          <button className={section === "execucoes" ? "active" : ""} onClick={() => setSection("execucoes")}>Execuções</button>
          <button className={section === "pendencias" ? "active" : ""} onClick={() => setSection("pendencias")}>Pendências</button>
          <button className={section === "prompts" ? "active" : ""} onClick={() => setSection("prompts")}>Prompts</button>
          <button className={section === "governanca" ? "active" : ""} onClick={() => setSection("governanca")}>Governança</button>
        </nav>

        <div className="gm-sidebar-bottom">
          <button onClick={() => updateTheme(theme === "dark" ? "light" : "dark")}>Tema: {theme === "dark" ? "Escuro" : "Claro"}</button>
          <button onClick={logout}>Sair</button>
        </div>
      </aside>

      <section className="gm-main">
        <header className="gm-header">
          <div>
            <h1>{pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>
          <button className="gm-primary" onClick={compileUdn}>Gerar UDN</button>
        </header>

        <div className="gm-metrics">
          {metrics.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>

        {section === "visao" ? (
          <div className="gm-grid">
            <section className="gm-card">
              <h2>Resumo Operacional</h2>
              <div className="gm-list">
                <p>Missão atual: <strong>{mission.id || "não definida"}</strong></p>
                <p>Owner: <strong>{createdBy}</strong></p>
                <p>Partes em fila: <strong>{parts.length}</strong></p>
                <p>Prompt por referência: <strong>{selectedPrompt ? selectedPrompt.prompt_id : "nenhum"}</strong></p>
              </div>
              <button onClick={() => setSection("missoes")}>Ir para Missões</button>
            </section>

            <section className="gm-card">
              <h2>Consumo e Controle</h2>
              <div className="gm-list">
                <p>Token control: <strong>{tokenControl.enabled ? "ativo" : "inativo"}</strong></p>
                <p>Hard stop: <strong>{tokenControl.hard_stop ? "ativo" : "inativo"}</strong></p>
                <p>Limite input/output: <strong>{tokenControl.max_input_tokens} / {tokenControl.max_output_tokens}</strong></p>
              </div>
              <button onClick={() => setSection("governanca")}>Ir para Governança</button>
            </section>
          </div>
        ) : null}

        {section === "missoes" ? (
          <section className="gm-card">
            <h2>Criar Missão</h2>
            <label>
              Mission ID
              <input value={mission.id} onChange={(e) => setMission({ ...mission, id: e.target.value })} />
            </label>
            <label>
              Objetivo
              <input value={mission.target} onChange={(e) => setMission({ ...mission, target: e.target.value })} />
            </label>
            <div className="gm-row">
              <label>
                Branch
                <input value={mission.branch} onChange={(e) => setMission({ ...mission, branch: e.target.value })} />
              </label>
              <label>
                Agente
                <select value={mission.agent_id} onChange={(e) => setMission({ ...mission, agent_id: e.target.value })}>
                  <option value="CPP">CPP</option>
                  <option value="CPP-IA">CPP-IA</option>
                </select>
              </label>
            </div>
            <label>
              Criado por
              <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} />
            </label>

            <div className="gm-row">
              <label>
                Prompt de referência
                <select value={selectedPromptId} onChange={(e) => setSelectedPromptId(e.target.value)}>
                  <option value="">Sem referência</option>
                  {promptLibrary.map((prompt) => (
                    <option key={prompt.prompt_id} value={prompt.prompt_id}>{prompt.prompt_id} - {prompt.title}</option>
                  ))}
                </select>
              </label>
              <label>
                Variáveis (chave=valor)
                <textarea rows={3} value={promptVarsRaw} onChange={(e) => setPromptVarsRaw(e.target.value)} />
              </label>
            </div>

            <h3>Particionamento (Staff)</h3>
            <div className="gm-part-list">
              {parts.map((part, index) => (
                <div key={`${part.part_id}-${index}`} className="gm-part-item">
                  <div className="gm-row">
                    <label>
                      Parte
                      <input
                        value={part.part_id}
                        onChange={(e) => updatePart(index, { part_id: e.target.value })}
                        placeholder={`P${index + 1}`}
                      />
                    </label>
                    <label>
                      Prioridade
                      <select value={part.priority} onChange={(e) => updatePart(index, { priority: e.target.value as PartPriority })}>
                        <option value="P0">P0</option>
                        <option value="P1">P1</option>
                        <option value="P2">P2</option>
                      </select>
                    </label>
                  </div>
                  <div className="gm-row">
                    <label>
                      Executor
                      <select value={part.executor} onChange={(e) => updatePart(index, { executor: e.target.value as PartExecutor })}>
                        <option value="STAFF">STAFF</option>
                        <option value="CPP">CPP</option>
                        <option value="CPP-IA">CPP-IA</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => removePart(index)}>Remover</button>
                  </div>
                  <label>
                    Entrega da Parte
                    <input value={part.goal} onChange={(e) => updatePart(index, { goal: e.target.value })} placeholder="Descreva o objetivo desta parte" />
                  </label>
                </div>
              ))}
            </div>
            <button type="button" onClick={addPart}>+ Adicionar parte</button>

            <div className="gm-row">
              <label>
                Budget USD
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={tokenControl.budget_usd}
                  onChange={(e) => setTokenControl({ ...tokenControl, budget_usd: Number(e.target.value || 0) })}
                />
              </label>
              <label>
                Budget BRL
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={tokenControl.budget_brl}
                  onChange={(e) => setTokenControl({ ...tokenControl, budget_brl: Number(e.target.value || 0) })}
                />
              </label>
            </div>

            <div className="gm-row">
              <label>
                Max Input Tokens
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={tokenControl.max_input_tokens}
                  onChange={(e) => setTokenControl({ ...tokenControl, max_input_tokens: Number(e.target.value || 1) })}
                />
              </label>
              <label>
                Max Output Tokens
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={tokenControl.max_output_tokens}
                  onChange={(e) => setTokenControl({ ...tokenControl, max_output_tokens: Number(e.target.value || 1) })}
                />
              </label>
            </div>

            <div className="gm-row">
              <button onClick={() => setTokenControl({ ...tokenControl, enabled: !tokenControl.enabled })}>
                Token Control: {tokenControl.enabled ? "ON" : "OFF"}
              </button>
              <button onClick={() => setTokenControl({ ...tokenControl, hard_stop: !tokenControl.hard_stop })}>
                Hard Stop: {tokenControl.hard_stop ? "ON" : "OFF"}
              </button>
            </div>

            <div className="gm-row">
              <button onClick={estimateCost}>Prospecção de Custo</button>
              <button className="gm-primary" onClick={registerMission} disabled={!udn}>Registrar no HUB</button>
            </div>
          </section>
        ) : null}

        {section === "execucoes" ? (
          <section className="gm-card">
            <h2>Monitoramento</h2>
            <textarea value={udn} onChange={(e) => setUdn(e.target.value)} rows={8} />
            {ackRequired ? (
              <div className="gm-ack">
                <input value={ownerNote} onChange={(e) => setOwnerNote(e.target.value)} placeholder="Nota do owner (opcional)" />
                <div className="gm-row">
                  <button onClick={() => ownerAck("approve")}>Aprovar</button>
                  <button onClick={() => ownerAck("deny")}>Negar</button>
                </div>
              </div>
            ) : null}
            <pre>{responseText || "Aguardando operação..."}</pre>
            <pre>{tokenPreview || "Prospecção de custo pendente..."}</pre>
            <pre>{tokenRealtime || "Monitoramento em tempo real aguardando..."}</pre>
          </section>
        ) : null}

        {section === "pendencias" ? (
          <section className="gm-card">
            <h2>Pendências Atuais</h2>
            <ul className="gm-pending-list">
              {pendingItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="gm-row">
              <button onClick={() => setSection("missoes")}>Abrir Missões</button>
              <button onClick={() => setSection("execucoes")}>Abrir Execuções</button>
            </div>
          </section>
        ) : null}

        {section === "prompts" ? (
          <div className="gm-grid">
            <section className="gm-card">
              <h2>Cadastro de Prompt</h2>
              <label>
                Título
                <input value={promptForm.title} onChange={(e) => setPromptForm({ ...promptForm, title: e.target.value })} />
              </label>
              <label>
                Descrição
                <input value={promptForm.description} onChange={(e) => setPromptForm({ ...promptForm, description: e.target.value })} />
              </label>
              <label>
                Finalidade
                <input value={promptForm.purpose} onChange={(e) => setPromptForm({ ...promptForm, purpose: e.target.value })} />
              </label>
              <label>
                Tags (vírgula)
                <input value={promptForm.tags} onChange={(e) => setPromptForm({ ...promptForm, tags: e.target.value })} />
              </label>
              <label>
                Template
                <textarea rows={8} value={promptForm.template} onChange={(e) => setPromptForm({ ...promptForm, template: e.target.value })} />
              </label>
              <button className="gm-primary" onClick={savePrompt}>Salvar Prompt</button>
            </section>

            <section className="gm-card">
              <h2>Biblioteca</h2>
              <div className="gm-prompt-list">
                {promptLibrary.map((prompt) => (
                  <article key={prompt.prompt_id} className={`gm-prompt-item ${selectedPromptId === prompt.prompt_id ? "active" : ""}`}>
                    <button onClick={() => setSelectedPromptId(prompt.prompt_id)}>{prompt.prompt_id} - {prompt.title}</button>
                    <small>{prompt.description || prompt.purpose || "Sem descrição"}</small>
                    <div className="gm-tag-list">
                      {prompt.tags.map((tag) => (
                        <span key={`${prompt.prompt_id}-${tag}`}>{tag}</span>
                      ))}
                    </div>
                    <div className="gm-row">
                      <button onClick={() => {
                        setSelectedPromptId(prompt.prompt_id);
                        setSection("missoes");
                      }}>
                        Usar na Missão
                      </button>
                      <button onClick={() => deletePrompt(prompt.prompt_id)}>Excluir</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {section === "governanca" ? (
          <div className="gm-grid">
            <section className="gm-card">
              <h2>Política de Custo</h2>
              <div className="gm-row">
                <label>
                  Limite diário (tokens)
                  <input
                    type="number"
                    min={1000}
                    step={100}
                    value={policy.daily_token_limit}
                    onChange={(e) => setPolicy({ ...policy, daily_token_limit: Number(e.target.value || 1000) })}
                  />
                </label>
                <label>
                  Limite diário (USD)
                  <input
                    type="number"
                    min={1}
                    step="0.1"
                    value={policy.daily_usd_limit}
                    onChange={(e) => setPolicy({ ...policy, daily_usd_limit: Number(e.target.value || 1) })}
                  />
                </label>
              </div>
              <div className="gm-row">
                <label>
                  Limite mensal (USD)
                  <input
                    type="number"
                    min={5}
                    step="0.1"
                    value={policy.monthly_usd_limit}
                    onChange={(e) => setPolicy({ ...policy, monthly_usd_limit: Number(e.target.value || 5) })}
                  />
                </label>
                <label>
                  Alerta em (%)
                  <input
                    type="number"
                    min={1}
                    max={99}
                    step={1}
                    value={policy.warn_threshold_pct}
                    onChange={(e) => setPolicy({ ...policy, warn_threshold_pct: Number(e.target.value || 80) })}
                  />
                </label>
              </div>
              <div className="gm-row">
                <button onClick={() => setPolicy({ ...policy, auto_pause_on_limit: !policy.auto_pause_on_limit })}>
                  Auto Pause: {policy.auto_pause_on_limit ? "ON" : "OFF"}
                </button>
                <button onClick={() => setPolicy({ ...policy, hard_stop: !policy.hard_stop })}>
                  Hard Stop: {policy.hard_stop ? "ON" : "OFF"}
                </button>
              </div>
              <button className="gm-primary" onClick={savePolicy}>Salvar Política</button>
            </section>

            <section className="gm-card">
              <h2>Uso em Tempo Real</h2>
              <pre>{usageText || "Sem dados de uso no momento..."}</pre>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
