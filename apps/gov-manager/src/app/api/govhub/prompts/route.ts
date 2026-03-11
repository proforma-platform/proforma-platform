import { NextResponse } from "next/server";
import { hasSessionCookie } from "../../../../auth/session";
import {
  defaultPromptLibraryState,
  removePrompt,
  sanitizePromptLibraryState,
  upsertPrompt,
  type PromptInput
} from "../../../../core/prompt-library";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../core/govhub-snapshots";

const PROMPT_SNAPSHOT_TYPE = String(process.env.GOVHUB_PROMPTS_SNAPSHOT_TYPE || "gov_manager_prompt_library_v1").trim();

export async function GET(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const loaded = await loadSnapshotPayload(config, PROMPT_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizePromptLibraryState(loaded.payload) : defaultPromptLibraryState();

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: PROMPT_SNAPSHOT_TYPE,
      prompts: state.prompts,
      updated_at_utc: state.updated_at_utc,
      payload_sha256: loaded.payload_sha256 || null
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const action = String(data.action || "upsert").trim().toLowerCase();
  const actor = String(data.created_by || "staff@gov-manager").trim() || "staff@gov-manager";

  const loaded = await loadSnapshotPayload(config, PROMPT_SNAPSHOT_TYPE);
  let state = loaded.found && loaded.payload ? sanitizePromptLibraryState(loaded.payload) : defaultPromptLibraryState();

  if (action === "delete") {
    const promptId = String(data.prompt_id || "").trim();
    if (!promptId) {
      return NextResponse.json(
        { status: "invalid_request", error_code: "PROMPT_ID_REQUIRED", message: "prompt_id is required for delete" },
        { status: 400 }
      );
    }
    state = removePrompt(state, promptId);
    const saved = await saveSnapshotPayload(config, {
      snapshotType: PROMPT_SNAPSHOT_TYPE,
      payload: state,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "prompts"
    });

    return NextResponse.json(
      {
        status: saved.ok ? "ok" : "upstream_error",
        govhub_http: saved.status,
        action: "delete",
        prompt_id: promptId,
        prompts_count: state.prompts.length,
        payload_sha256: saved.payload_sha256,
        govhub_response: saved.response
      },
      { status: saved.ok ? 200 : 502 }
    );
  }

  const promptObj = data.prompt && typeof data.prompt === "object" ? (data.prompt as Record<string, unknown>) : null;
  if (!promptObj) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "PROMPT_REQUIRED", message: "prompt object is required" },
      { status: 400 }
    );
  }

  const payload: PromptInput = {
    title: String(promptObj.title || "").trim(),
    template: String(promptObj.template || "").trim(),
    created_by: actor,
    ...(typeof promptObj.prompt_id === "string" ? { prompt_id: promptObj.prompt_id } : {}),
    ...(typeof promptObj.type === "string" ? { type: promptObj.type } : {}),
    ...(typeof promptObj.description === "string" ? { description: promptObj.description } : {}),
    ...(typeof promptObj.purpose === "string" ? { purpose: promptObj.purpose } : {}),
    ...(Array.isArray(promptObj.tags) ? { tags: promptObj.tags.map((tag) => String(tag)) } : {}),
    ...(Array.isArray(promptObj.variables) ? { variables: promptObj.variables.map((v) => String(v)) } : {})
  };

  if (!payload.title || !payload.template) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error_code: "PROMPT_INVALID",
        message: "prompt.title and prompt.template are required"
      },
      { status: 400 }
    );
  }

  const upserted = upsertPrompt(state, payload);
  const saved = await saveSnapshotPayload(config, {
    snapshotType: PROMPT_SNAPSHOT_TYPE,
    payload: upserted.state,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef: "prompts"
  });

  return NextResponse.json(
    {
      status: saved.ok ? "ok" : "upstream_error",
      govhub_http: saved.status,
      action: "upsert",
      prompt: upserted.prompt,
      prompts_count: upserted.state.prompts.length,
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}
