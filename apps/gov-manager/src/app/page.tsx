'use client';

import { useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light";

function resolveOwnerAckRequired(payload: unknown): boolean {
  const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  if (obj.owner_ack_required === true) return true;
  const upstream = (obj.govhub_response && typeof obj.govhub_response === "object"
    ? obj.govhub_response
    : {}) as Record<string, unknown>;
  return upstream.owner_ack_required === true;
}

export default function GovManagerPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mission, setMission] = useState({ id: "", target: "", branch: "main", agent_id: "CPP" });
  const [createdBy, setCreatedBy] = useState("staff@gov-manager");
  const [udn, setUdn] = useState("");
  const [status, setStatus] = useState("idle");
  const [responseText, setResponseText] = useState("");
  const [ackRequired, setAckRequired] = useState(false);
  const [ownerNote, setOwnerNote] = useState("");

  useEffect(() => {
    const persisted = window.localStorage.getItem("gov-manager-theme");
    const next = persisted === "light" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

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
    const lines = [
      `!MIS|${mission.id || "SEM_ID"}|PLAN|REGISTRAR`,
      `#mu:${mission.target || "Registrar missao no GOV-HUB."}`,
      "#tau:registrar_missao;monitorar_execucao",
      "#sigma:READY",
      "!OUT:JSON_ONLY.NO_MD.NO_TXT."
    ];
    setUdn(lines.join("\n"));
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
          created_by: createdBy
        })
      });
      const payload = await response.json();
      setResponseText(JSON.stringify(payload, null, 2));
      setAckRequired(resolveOwnerAckRequired(payload));
      setStatus(response.ok ? "success" : "error");
    } catch {
      setStatus("error");
      setResponseText(JSON.stringify({ status: "error", error_code: "NETWORK_ERROR" }, null, 2));
    }
  }

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
      { label: "Agent", value: mission.agent_id },
      { label: "Branch", value: mission.branch }
    ],
    [mission.agent_id, mission.branch, mission.id, status]
  );

  return (
    <main className="gm-shell">
      <aside className="gm-sidebar">
        <div className="gm-brand">
          <span className="gm-logo-dot" />
          <span>n8n style hub</span>
        </div>
        <nav>
          <button className="active">Visao geral</button>
          <button>Missoes</button>
          <button>Execucoes</button>
          <button>Pendencias</button>
        </nav>
        <div className="gm-sidebar-bottom">
          <button onClick={() => updateTheme(theme === "dark" ? "light" : "dark")}>
            Tema: {theme === "dark" ? "Escuro" : "Claro"}
          </button>
          <button onClick={logout}>Sair</button>
        </div>
      </aside>

      <section className="gm-main">
        <header className="gm-header">
          <div>
            <h1>Visao geral</h1>
            <p>Cadastro e monitoramento de missoes do GOV-HUB.</p>
          </div>
          <button className="gm-primary" onClick={compileUdn}>
            Gerar UDN
          </button>
        </header>

        <div className="gm-metrics">
          {metrics.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>

        <div className="gm-grid">
          <section className="gm-card">
            <h2>Criar Missao</h2>
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
                Agent
                <select value={mission.agent_id} onChange={(e) => setMission({ ...mission, agent_id: e.target.value })}>
                  <option value="CPP">CPP</option>
                  <option value="CPP-IA">CPP-IA</option>
                </select>
              </label>
            </div>
            <label>
              Created by
              <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} />
            </label>
            <button className="gm-primary" onClick={registerMission} disabled={!udn}>
              Registrar no HUB
            </button>
          </section>

          <section className="gm-card">
            <h2>Monitoramento</h2>
            <textarea value={udn} onChange={(e) => setUdn(e.target.value)} rows={8} />
            {ackRequired ? (
              <div className="gm-ack">
                <input
                  value={ownerNote}
                  onChange={(e) => setOwnerNote(e.target.value)}
                  placeholder="Nota do owner (opcional)"
                />
                <div className="gm-row">
                  <button onClick={() => ownerAck("approve")}>Aprovar</button>
                  <button onClick={() => ownerAck("deny")}>Negar</button>
                </div>
              </div>
            ) : null}
            <pre>{responseText || "Aguardando operacao..."}</pre>
          </section>
        </div>
      </section>
    </main>
  );
}

