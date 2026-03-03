#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import json
from pathlib import Path

BASE = Path("docs/governance/hub/n8n/exports")

rules = {
    "missions-next.json": {
        "nodes": ["Respond Dispatch", "Responder Atribuido+Dispatch", "Respond Error"],
        "forbid": ["worker_response", "report_ingest_response", "autofix_response", "message:"],
        "max_len": 900,
    },
    "report-ingest.json": {
        "nodes": ["Responder 200", "Responder Erro"],
        "forbid": ["report_md", "message:"],
        "max_len": 500,
    },
    "missions-autofix-limited.json": {
        "nodes": ["Responder Autofix OK", "Responder Missao Nao Encontrada", "Responder Erro Autofix"],
        "forbid": ["control:", "message:"],
        "max_len": 450,
    },
    "missions-owner-ack.json": {
        "nodes": ["Responder 200", "Responder Erro"],
        "forbid": ["decision:", "transition:", "message:"],
        "max_len": 450,
    },
}

for file_name, cfg in rules.items():
    payload = json.loads((BASE / file_name).read_text(encoding="utf-8"))
    wf = payload[0] if isinstance(payload, list) else payload
    nodes = {n.get("name"): n for n in wf.get("nodes", [])}
    for node_name in cfg["nodes"]:
        if node_name not in nodes:
            raise SystemExit(f"FALHA: node ausente {file_name}::{node_name}")
        rb = nodes[node_name].get("parameters", {}).get("responseBody", "")
        if not rb:
            raise SystemExit(f"FALHA: responseBody vazio {file_name}::{node_name}")
        if len(rb) > cfg["max_len"]:
            raise SystemExit(f"FALHA: responseBody acima do limite ({len(rb)}>{cfg['max_len']}) em {file_name}::{node_name}")
        for bad in cfg["forbid"]:
            if bad in rb:
                raise SystemExit(f"FALHA: campo/propriedade proibida '{bad}' em {file_name}::{node_name}")

print("COMPACT_OUTPUT_OK")
PY

