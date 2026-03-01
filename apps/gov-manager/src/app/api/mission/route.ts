import { NextResponse } from "next/server";
import { resolveAuthContext } from "../../../auth";
import { validateMissionRequest } from "../../../contracts/mission";
import { adaptLegacyMissionEnvelope, normalizeMissionResponse } from "../../../contracts/adapter-v7";
import { validateTDVSignal } from "../../../tdv";
import { commitMissionToLedger } from "../../../infra/ledger";

export async function POST(request: Request) {
  const auth = resolveAuthContext(request.headers);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        status: "rejected",
        mission_id: "",
        ledger_ref: "",
        contract_version: "v7-baseline",
        errors: ["invalid json body"]
      },
      { status: 400 }
    );
  }

  const adapted = adaptLegacyMissionEnvelope(body);
  const validated = validateMissionRequest(adapted ?? body);

  if (!validated.valid || !validated.data) {
    return NextResponse.json(
      {
        status: "rejected",
        mission_id: "",
        ledger_ref: "",
        contract_version: "v7-baseline",
        errors: validated.errors
      },
      { status: 400 }
    );
  }

  const tdv = validateTDVSignal(validated.data.udn);
  if (!tdv.valid) {
    return NextResponse.json(
      {
        status: "rejected",
        mission_id: validated.data.mission.id,
        ledger_ref: "",
        contract_version: "v7-baseline",
        errors: tdv.reasons
      },
      { status: 422 }
    );
  }

  const result = normalizeMissionResponse(commitMissionToLedger(validated.data));

  return NextResponse.json(
    {
      ...result,
      auth_actor: auth.actor,
      auth_applied: auth.authenticated
    },
    { status: 200 }
  );
}
