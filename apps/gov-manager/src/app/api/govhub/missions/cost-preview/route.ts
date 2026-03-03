import { NextResponse } from "next/server";
import { hasSessionCookie } from "../../../../../auth/session";
import { adaptLegacyMissionEnvelope } from "../../../../../contracts/adapter-v7";
import { validateMissionRequest } from "../../../../../contracts/mission-validator";
import { buildCostPreview } from "../../../../../core/token-estimator";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig } from "../../../../../core/govhub-snapshots";
import { defaultPromptLibraryState, renderPromptTemplate, sanitizePromptLibraryState } from "../../../../../core/prompt-library";

const PROMPT_SNAPSHOT_TYPE = String(process.env.GOVHUB_PROMPTS_SNAPSHOT_TYPE || "gov_manager_prompt_library_v1").trim();

export async function POST(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const adapted = adaptLegacyMissionEnvelope(body);
  const validated = validateMissionRequest(adapted ?? body);
  if (!validated.valid || !validated.data) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "MISSION_CONTRACT_INVALID", errors: validated.errors },
      { status: 400 }
    );
  }

  let effectiveUdn = validated.data.udn;
  let promptRefMeta: Record<string, unknown> | null = null;

  if (validated.data.prompt_ref) {
    const snapshotConfig = resolveGovhubSnapshotConfig();
    if (snapshotConfig.baseUrl && snapshotConfig.token) {
      const loaded = await loadSnapshotPayload(snapshotConfig, PROMPT_SNAPSHOT_TYPE);
      const state = loaded.found && loaded.payload ? sanitizePromptLibraryState(loaded.payload) : defaultPromptLibraryState();
      const prompt = state.prompts.find((item) => item.prompt_id === validated.data!.prompt_ref!.prompt_id);

      if (!prompt) {
        return NextResponse.json(
          { status: "invalid_request", error_code: "PROMPT_REF_NOT_FOUND", message: "prompt_ref.prompt_id not found" },
          { status: 404 }
        );
      }

      const vars = validated.data.prompt_ref.variables || {};
      if (validated.data.prompt_ref.inject_mode === "replace_udn") {
        const rendered = renderPromptTemplate(prompt.template, vars).trim();
        if (!rendered) {
          return NextResponse.json(
            { status: "invalid_request", error_code: "PROMPT_REF_RENDER_EMPTY", message: "rendered prompt is empty" },
            { status: 422 }
          );
        }
        effectiveUdn = rendered;
      } else {
        const varKeys = Object.keys(vars).slice(0, 24).join(",") || "none";
        effectiveUdn = `${validated.data.udn}\n#ctx_prompt_ref:id=${prompt.prompt_id};hash=${prompt.prompt_hash};vars=${varKeys}`;
      }

      promptRefMeta = {
        prompt_id: prompt.prompt_id,
        prompt_hash: prompt.prompt_hash,
        inject_mode: validated.data.prompt_ref.inject_mode || "append_ref",
        variables: vars
      };
    }
  }

  const preview = buildCostPreview({
    mission_id: validated.data.mission.id,
    agent_id: validated.data.mission.agent_id || "CPP",
    udn: effectiveUdn,
    objective: validated.data.mission.target || "",
    token_control: validated.data.token_control || null
  });

  return NextResponse.json(
    {
      status: "ok",
      next_action: "review_token_budget_before_register",
      prompt_ref: promptRefMeta,
      preview
    },
    { status: 200 }
  );
}
