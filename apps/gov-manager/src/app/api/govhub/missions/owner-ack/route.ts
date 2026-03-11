import { NextResponse } from "next/server";
import { hasSessionCookie } from "../../../../../auth/session";

function resolveGovhubConfig() {
  const baseUrl = String(process.env.GOVHUB_BASE_URL || "").trim();
  const token = String(process.env.GOVHUB_TOKEN || "").trim();
  const endpointPath = String(process.env.GOVHUB_MISSIONS_OWNER_ACK_PATH || "/webhook/govhub/missions/owner-ack").trim();
  const compatEndpointPath = String(
    process.env.GOVHUB_MISSIONS_OWNER_ACK_COMPAT_PATH ||
      "/webhook/govhub-v7-missions-owner-ack/webhook%2520missao%2520owner%2520ack/govhub/missions/owner-ack"
  ).trim();
  return { baseUrl, token, endpointPath, compatEndpointPath };
}

export async function POST(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const { baseUrl, token, endpointPath, compatEndpointPath } = resolveGovhubConfig();
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

  const canonicalEndpoint = `${baseUrl.replace(/\/+$/, "")}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`;
  const compatEndpoint = `${baseUrl.replace(/\/+$/, "")}${compatEndpointPath.startsWith("/") ? compatEndpointPath : `/${compatEndpointPath}`}`;
  const reqBody = JSON.stringify({ mission_id, decision, owner_id, ...(note ? { note } : {}) });

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(canonicalEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-govhub-token": token
      },
      body: reqBody,
      cache: "no-store"
    });
    if (upstreamResponse.status === 404) {
      upstreamResponse = await fetch(compatEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-govhub-token": token
        },
        body: reqBody,
        cache: "no-store"
      });
    }
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

  const upstreamObj =
    upstreamJson && typeof upstreamJson === "object" && !Array.isArray(upstreamJson)
      ? (upstreamJson as Record<string, unknown>)
      : null;
  const upstreamLogicalOk = String(upstreamObj?.status || "").toLowerCase() !== "error";
  const finalOk = upstreamResponse.ok && upstreamLogicalOk;

  return NextResponse.json(
    {
      status: finalOk ? "owner_ack_applied" : "upstream_error",
      govhub_http: upstreamResponse.status,
      mission_id,
      decision,
      govhub_response: upstreamJson
    },
    { status: finalOk ? 200 : 502 }
  );
}
