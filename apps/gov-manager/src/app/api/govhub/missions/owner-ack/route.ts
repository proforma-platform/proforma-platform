import { NextResponse } from "next/server";

function resolveGovhubConfig() {
  const baseUrl = String(process.env.GOVHUB_BASE_URL || "").trim();
  const token = String(process.env.GOVHUB_TOKEN || "").trim();
  const endpointPath = String(process.env.GOVHUB_MISSIONS_OWNER_ACK_PATH || "/webhook/govhub/missions/owner-ack").trim();
  return { baseUrl, token, endpointPath };
}

export async function POST(request: Request) {
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

  const input = body as Record<string, unknown>;
  const mission_id = String(input.mission_id || "").trim();
  const decision = String(input.decision || "").trim().toLowerCase();
  const owner_id = String(input.owner_id || "").trim();
  const note = String(input.note || "").trim();

  if (!mission_id || !owner_id || !["approve", "deny"].includes(decision)) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error_code: "OWNER_ACK_INVALID",
        message: "mission_id, owner_id and decision(approve|deny) are required"
      },
      { status: 400 }
    );
  }

  const endpoint = `${baseUrl.replace(/\/+$/, "")}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-govhub-token": token
      },
      body: JSON.stringify({ mission_id, decision, owner_id, ...(note ? { note } : {}) }),
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
      status: upstreamResponse.ok ? "owner_ack_applied" : "upstream_error",
      govhub_http: upstreamResponse.status,
      mission_id,
      decision,
      govhub_response: upstreamJson
    },
    { status: upstreamResponse.ok ? 200 : 502 }
  );
}
