#!/usr/bin/env bash
set -euo pipefail

EXPORT_PATH="${1:-docs/governance/hub/n8n/exports/missions-next.json}"

python3 - "$EXPORT_PATH" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    payload = json.load(f)

wf = payload[0] if isinstance(payload, list) else payload
nodes = {n.get("name"): n for n in wf.get("nodes", [])}

required_nodes = [
    "Normalizar Atribuicao",
    "Respond Dispatch",
    "Responder Atribuido+Dispatch",
]
for name in required_nodes:
    if name not in nodes:
        raise SystemExit(f"FALHA: node ausente: {name}")

normalize_code = nodes["Normalizar Atribuicao"]["parameters"].get("jsCode", "")
if "assigned_without_identity_downgraded_to_no_work" not in normalize_code:
    raise SystemExit("FALHA: regra de downgrade para no_work ausente")

resp_dispatch = nodes["Respond Dispatch"]["parameters"].get("responseBody", "")
resp_dispatched = nodes["Responder Atribuido+Dispatch"]["parameters"].get("responseBody", "")

checks = [
    ("Respond Dispatch", "mission_task_id", resp_dispatch),
    ("Respond Dispatch", "hasIdentity ? 'assigned' : 'no_work'", resp_dispatch),
    ("Responder Atribuido+Dispatch", "mission_task_id", resp_dispatched),
    ("Responder Atribuido+Dispatch", "hasIdentity ? 'assigned' : 'no_work'", resp_dispatched),
]
for where, needle, body in checks:
    if needle not in body:
        raise SystemExit(f"FALHA: '{needle}' ausente em {where}")

print("CONTRATO_EXPORT_OK missions-next")
PY
