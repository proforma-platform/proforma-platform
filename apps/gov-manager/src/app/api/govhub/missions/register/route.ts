import { NextResponse } from "next/server";
import { adaptLegacyMissionEnvelope } from "../../../../../contracts/adapter-v7";
import { validateMissionRequest } from "../../../../../contracts/mission-validator";
import { validateTDVSignal } from "../../../../../tdv";
import { hasSessionCookie } from "../../../../../auth/session";

function resolveGovhubConfig() {
  const baseUrl = String(process.env.GOVHUB_BASE_URL || "").trim();
  const token = String(process.env.GOVHUB_TOKEN || "").trim();
  const endpointPath = String(process.env.GOVHUB_MISSIONS_REGISTER_PATH || "/webhook/govhub/missions/register").trim();
  return { baseUrl, token, endpointPath };
}

export async function POST(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const { baseUrl, token, endpointPath } = resolveGovhubConfig();
  if (!baseUrl || !token) {
    return NextResponse.json(
      {
        status: "misconfigured",
        error_code: "GOVHUB_ENV_REQUIRED",
        message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required"
      },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid_request", error_code: "JSON_INVALID", message: "invalid json body" },
      { status: 400 }
    );
  }

  const adapted = adaptLegacyMissionEnvelope(body);
  const validated = validateMissionRequest(adapted ?? body);
  if (!validated.valid || !validated.data) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "MISSION_CONTRACT_INVALID", errors: validated.errors },
      { status: 400 }
    );
  }

  const tdv = validateTDVSignal(validated.data.udn);
  if (!tdv.valid) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "UDN_TDV_INVALID", errors: tdv.reasons },
      { status: 422 }
    );
  }

  const upstreamPayload = {
    mission_id: validated.data.mission.id,
    udn_mission: validated.data.udn,
    tdv_version: "1.0",
    created_by: validated.data.created_by || "staff@gov-manager",
    branch: validated.data.mission.branch || "main",
    agent_id: validated.data.mission.agent_id || "CPP",
    ...(validated.data.autofix_control ? { autofix_control: validated.data.autofix_control } : {})
  };

  const endpoint = `${baseUrl.replace(/\/+$/, "")}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-govhub-token": token
      },
      body: JSON.stringify(upstreamPayload),
      cache: "no-store"
    });
  } catch {
    return NextResponse.json(
      { status: "upstream_unreachable", error_code: "GOVHUB_FETCH_FAILED" },
      { status: 502 }
    );
  }

  let upstreamJson: unknown = null;
  try {
    upstreamJson = await upstreamResponse.json();
  } catch {
    upstreamJson = { raw_status: upstreamResponse.status };
  }

  return NextResponse.json(
    {
      status: upstreamResponse.ok ? "registered" : "upstream_error",
      govhub_http: upstreamResponse.status,
      mission_id: validated.data.mission.id,
      token_control: validated.data.token_control || null,
      govhub_response: upstreamJson
    },
    { status: upstreamResponse.ok ? 200 : 502 }
  );
}
