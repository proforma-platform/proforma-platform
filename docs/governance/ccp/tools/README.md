# CCP Tools

Minimal tooling for CCP payload hygiene.

## Scripts
- `ccp-lint.sh|ps1`: structural lint + required keys + size + secret scan.
- `ccp-minify.sh|ps1`: generate single-line JSON for transport.
- `ccp-secret-scan.sh|ps1`: detect blocked secret patterns.

## Required Environment
No repository-level dependencies are required.

Linux/macOS:
- bash + grep + sed + awk
- jq optional
- python3 optional fallback for parse/minify

PowerShell:
- built-in `ConvertFrom-Json` / `ConvertTo-Json`

## Usage
```bash
bash docs/governance/ccp/tools/ccp-lint.sh mission docs/governance/ccp/examples/mission.example.json
bash docs/governance/ccp/tools/ccp-minify.sh docs/governance/ccp/examples/mission.example.json /tmp/mission.min.json
bash docs/governance/ccp/tools/ccp-secret-scan.sh docs/governance/ccp/examples/report.example.json
```

```powershell
pwsh docs/governance/ccp/tools/ccp-lint.ps1 -Type mission -File docs/governance/ccp/examples/mission.example.json
pwsh docs/governance/ccp/tools/ccp-minify.ps1 -InputFile docs/governance/ccp/examples/mission.example.json -OutputFile /tmp/mission.min.json
pwsh docs/governance/ccp/tools/ccp-secret-scan.ps1 -File docs/governance/ccp/examples/report.example.json
```

## Optional Full Schema Validation
Optional helper:
- `docs/governance/ccp/tools/node/validate.mjs`

Example:
```bash
node docs/governance/ccp/tools/node/validate.mjs \
  docs/governance/ccp/schema/ccp-mission.schema.json \
  docs/governance/ccp/examples/mission.example.json
```

Limitation:
- By default, lint is structural and enforces required keys/types.
- Full JSON Schema evaluation is optional via `validate.mjs`.

## Safety
- Payloads must be <= 128KB.
- Secret-scan must pass before transport.
- Do not include credentials in CCP payloads.
