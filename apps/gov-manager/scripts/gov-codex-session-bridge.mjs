#!/usr/bin/env node

import { createHmac } from "crypto";
import { exec as execCb } from "child_process";
import { promises as fs } from "fs";
import { promisify } from "util";

const baseUrl = String(process.env.GOV_MANAGER_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const username = String(process.env.GOV_MANAGER_LOGIN_USER || "admin").trim();
const password = String(process.env.GOV_MANAGER_LOGIN_PASSWORD || "admin").trim();
const roleRaw = String(process.env.GOV_MANAGER_LOGIN_ROLE || "admin").trim().toLowerCase();
const role = roleRaw === "viewer" || roleRaw === "engineer" ? roleRaw : "admin";
const sessionSecret = String(process.env.GOV_MANAGER_SESSION_SECRET || "").trim() || `${username}:${password}:gov-manager-session-v1`;
const agentId = String(process.env.GOV_EXEC_AGENT_ID || "gov-codex-01").trim();
const sessionId = String(process.env.GOV_EXEC_SESSION_ID || "").trim();
const sessionToken = String(process.env.GOV_EXEC_SESSION_TOKEN || "").trim();
const host = String(process.env.GOV_EXEC_HOST || "ubuntuserver").trim();
const officeId = String(process.env.GOV_EXEC_OFFICE_ID || "CPP").trim().toUpperCase();
const heartbeatSec = Math.max(10, Number(process.env.GOV_EXEC_HEARTBEAT_SEC || 30));
const doneFile = String(process.env.GOV_EXEC_DONE_FILE || `/tmp/${agentId}.done`).trim();
const blockedFile = String(process.env.GOV_EXEC_BLOCKED_FILE || `/tmp/${agentId}.blocked`).trim();
const resumeFile = String(process.env.GOV_EXEC_RESUME_FILE || `/tmp/${agentId}.resume`).trim();
const adapterEnabled = String(process.env.GOV_EXEC_ADAPTER_ENABLED || "false").trim().toLowerCase() === "true";
const adapterCmd = String(process.env.GOV_EXEC_ADAPTER_CMD || "").trim();
const adapterWorkdir = String(process.env.GOV_EXEC_ADAPTER_WORKDIR || process.cwd()).trim();
const adapterTimeoutMs = Math.max(1000, Number(process.env.GOV_EXEC_ADAPTER_TIMEOUT_MS || 600000));
const adapterStateFile = String(process.env.GOV_EXEC_ADAPTER_STATE_FILE || `/tmp/${agentId}.adapter-state.json`).trim();
const adapterArtifactRoot = String(process.env.GOV_EXEC_ADAPTER_ARTIFACT_DIR || `/tmp/${agentId}-artifacts`).trim();

const execAsync = promisify(execCb);

if (!sessionId || !sessionToken) {
  process.stderr.write("missing GOV_EXEC_SESSION_ID or GOV_EXEC_SESSION_TOKEN\n");
  process.exit(1);
}

function createSessionCookie() {
  const payload = Buffer.from(JSON.stringify({
    username,
    role,
    issued_at_utc: new Date().toISOString()
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `gov_manager_session=${payload}.${signature}`;
}

const cookie = createSessionCookie();

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cookie": cookie
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`post ${path} ${response.status} ${text}`.slice(0, 500));
  }
  return response.json();
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "cookie": cookie
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`get ${path} ${response.status} ${text}`.slice(0, 500));
  }
  return response.json();
}

async function readTextFile(path) {
  try {
    return await fs.readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadAdapterState() {
  try {
    const raw = await fs.readFile(adapterStateFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

async function saveAdapterState(state) {
  await fs.writeFile(adapterStateFile, JSON.stringify(state), "utf8");
}

function missionKey(session) {
  return `${String(session.current_mission_id || "")}::${String(session.current_run_id || "")}`;
}

async function runAdapterIfNeeded(session) {
  if (!adapterEnabled || !adapterCmd) return false;
  const key = missionKey(session);
  if (!key || key === "::") return false;
  const state = await loadAdapterState();
  if (state[key]?.status === "done" || state[key]?.status === "blocked") return false;

  state[key] = { status: "running", updated_at_utc: new Date().toISOString() };
  await saveAdapterState(state);

  await post("/api/govhub/operations/execution-events", {
    session_id: sessionId,
    session_token: sessionToken,
    mission_id: session.current_mission_id,
    trace_id: session.current_trace_id,
    run_id: session.current_run_id,
    event_type: "progress",
    stage: "execution",
    progress_pct: 15,
    message: `Execution adapter started (${agentId}).`
  });

  const missionDir = `${adapterArtifactRoot}/${String(session.current_mission_id || "").toLowerCase()}/${String(session.current_run_id || "").toLowerCase()}`;
  await fs.mkdir(missionDir, { recursive: true });
  const outputFile = `${missionDir}/adapter-output.txt`;
  const metaFile = `${missionDir}/adapter-meta.json`;

  try {
    const { stdout, stderr } = await execAsync(adapterCmd, {
      cwd: adapterWorkdir,
      timeout: adapterTimeoutMs,
      maxBuffer: 1024 * 1024 * 8,
      env: {
        ...process.env,
        GOV_MISSION_ID: String(session.current_mission_id || ""),
        GOV_TRACE_ID: String(session.current_trace_id || ""),
        GOV_RUN_ID: String(session.current_run_id || "")
      }
    });
    const text = `${String(stdout || "")}${stderr ? `\n${String(stderr)}` : ""}`.slice(0, 20000);
    await fs.writeFile(outputFile, text, "utf8");
    await fs.writeFile(metaFile, JSON.stringify({ command: adapterCmd, workdir: adapterWorkdir, output_file: outputFile }), "utf8");

    const completionProof = `artifact://${outputFile}`;
    const deliverySummary = `Adapter execution succeeded for ${session.current_mission_id}.`;
    const validationSummary = "Command exited with code 0; artifact persisted.";
    await post("/api/govhub/operations/sessions", {
      action: "complete_mission",
      session_id: sessionId,
      session_token: sessionToken,
      mission_id: session.current_mission_id,
      trace_id: session.current_trace_id,
      run_id: session.current_run_id,
      completion_ack: true,
      completion_proof: completionProof,
      delivery_summary: deliverySummary,
      validation_summary: validationSummary,
      request_id: `adapter-${Date.now()}`
    });
    state[key] = { status: "done", completion_proof: completionProof, updated_at_utc: new Date().toISOString() };
    await saveAdapterState(state);
    return true;
  } catch (error) {
    const message = `Execution adapter failed: ${String(error instanceof Error ? error.message : error).slice(0, 500)}`;
    await post("/api/govhub/operations/execution-events", {
      session_id: sessionId,
      session_token: sessionToken,
      mission_id: session.current_mission_id,
      trace_id: session.current_trace_id,
      run_id: session.current_run_id,
      event_type: "blocked",
      stage: "execution",
      progress_pct: 0,
      message
    });
    state[key] = { status: "blocked", error: message, updated_at_utc: new Date().toISOString() };
    await saveAdapterState(state);
    return true;
  }
}

async function tick() {
  const sessionPayload = await get(`/api/govhub/operations/sessions?session_id=${encodeURIComponent(sessionId)}`);
  const session = Array.isArray(sessionPayload?.sessions) ? sessionPayload.sessions[0] : null;
  const currentLoad = session?.current_mission_id ? 1 : 0;
  let missionProgressPct = currentLoad > 0 ? 3 : 0;

  await post("/api/govhub/operations/agents", {
    action: "heartbeat",
    agent_id: agentId,
    role: "CPP",
    group: "workers",
    capabilities: ["mission", "queue", "execute", "session"],
    heartbeat_interval_sec: heartbeatSec,
    max_concurrency: 1,
    current_load: currentLoad,
    health: "up"
  });

  await post("/api/govhub/operations/sessions", {
    action: "heartbeat_session",
    session_id: sessionId,
    session_token: sessionToken
  });

  if (session?.current_mission_id && session?.current_trace_id && session?.current_run_id) {
    try {
      const queuePayload = await get(`/api/govhub/operations/queue?mission_id=${encodeURIComponent(String(session.current_mission_id || ""))}`);
      const queueRow = Array.isArray(queuePayload?.rows) ? queuePayload.rows[0] : null;
      const rawPct = Number(queueRow?.execution_progress_pct);
      if (Number.isFinite(rawPct)) {
        missionProgressPct = Math.max(0, Math.min(100, Math.trunc(rawPct)));
      }
    } catch {}

    try {
      if (await fileExists(blockedFile)) {
        const message = String(await readTextFile(blockedFile)).trim() || "Erro sem detalhe informado. Aguardando tratamento para continuar a execução.";
        await post("/api/govhub/operations/execution-events", {
          session_id: sessionId,
          session_token: sessionToken,
          mission_id: session.current_mission_id,
          trace_id: session.current_trace_id,
          run_id: session.current_run_id,
          event_type: "blocked",
          stage: "waiting",
          progress_pct: 0,
          message
        });
        return;
      }
      if (await fileExists(resumeFile)) {
        const message = String(await readTextFile(resumeFile)).trim() || "Bloqueio tratado. Execução retomada.";
        await post("/api/govhub/operations/execution-events", {
          session_id: sessionId,
          session_token: sessionToken,
          mission_id: session.current_mission_id,
          trace_id: session.current_trace_id,
          run_id: session.current_run_id,
          event_type: "progress",
          stage: "resume",
          progress_pct: 55,
          message
        });
        await fs.unlink(resumeFile);
      }
      if (await fileExists(doneFile)) {
        const rawDone = String(await readTextFile(doneFile)).trim();
        let proof = `proof://${agentId}/${session.current_mission_id}/${session.current_run_id}`;
        let deliverySummary = "";
        let validationSummary = "";
        if (rawDone) {
          try {
            const parsed = JSON.parse(rawDone);
            proof = String(parsed.completion_proof || parsed.proof || proof).trim() || proof;
            deliverySummary = String(parsed.delivery_summary || parsed.delivery || "").trim();
            validationSummary = String(parsed.validation_summary || parsed.validation || "").trim();
          } catch {
            proof = rawDone;
          }
        }
        await post("/api/govhub/operations/sessions", {
          action: "complete_mission",
          session_id: sessionId,
          session_token: sessionToken,
          mission_id: session.current_mission_id,
          trace_id: session.current_trace_id,
          run_id: session.current_run_id,
          completion_ack: true,
          completion_proof: proof,
          delivery_summary: deliverySummary,
          validation_summary: validationSummary
        });
        await fs.unlink(doneFile);
        return;
      }
      const adapterHandled = await runAdapterIfNeeded(session);
      if (adapterHandled) return;
    } catch {}

    await post("/api/govhub/operations/execution-events", {
      session_id: sessionId,
      session_token: sessionToken,
      mission_id: session.current_mission_id,
      trace_id: session.current_trace_id,
      run_id: session.current_run_id,
      event_type: "heartbeat",
      stage: "execution",
      progress_pct: missionProgressPct,
      message: `Heartbeat automático do executor ${agentId} em ${host}.`
    });
  }
}

async function main() {
  while (true) {
    try {
      await tick();
    } catch (error) {
      process.stderr.write(`${new Date().toISOString()} ${String(error instanceof Error ? error.message : error)}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, heartbeatSec * 1000));
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error instanceof Error ? error.message : error)}\n`);
  process.exit(1);
});
