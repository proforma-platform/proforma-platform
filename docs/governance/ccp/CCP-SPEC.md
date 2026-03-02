# CCP-SPEC

## Purpose
CCP (Compact Command Protocol) defines a strict machine-oriented message format for governance missions.

Protocol goals:
- reduce latency and token usage
- keep messages deterministic and auditable
- allow validation before execution and ingestion

## Constraints
All CCP transport messages MUST follow these rules:
- message MUST be a single JSON object
- transport form MUST be minified to one line
- free text prose outside JSON MUST NOT be used
- politeness boilerplate, greetings, emojis and decorative text MUST NOT be used
- null keys SHOULD be omitted

Pretty JSON is allowed only for repository examples and documentation.

## Versioning
Every payload MUST include `ccp_ver`.

Version policy:
- current version: `1.0.0`
- patch: non-breaking clarifications
- minor: additive keys and optional fields only
- major: breaking structure changes

Receivers MUST reject payloads with unsupported major version.

## Canonicalization
Transport canonicalization requirements:
- UTF-8 JSON, single line
- object keys SHOULD preserve producer order for traceability
- trailing spaces/newlines MUST be removed

Repository examples MAY remain pretty-printed for readability.

## Required Envelope Fields
All CCP payload types MUST include:
- `ccp_ver` (string)
- `id` (string)
- `ts` (string, RFC3339 UTC recommended)

## Error Protocol
Errors MUST be returned in the `ccp-error` envelope.
Minimum fields:
- `ccp_ver`
- `id`
- `ts`
- `status`
- `error_code`
- `message`

Allowed status values are defined in `schema/ccp-error.schema.json`.

## Security Rules
Before sending or ingesting a CCP payload:
- secret scan MUST pass
- structural lint MUST pass
- payload size MUST be <= 128KB

Payloads containing secrets MUST be rejected.

## Compatibility Rules
Compatibility for consumers:
- consumers MUST ignore unknown extension keys prefixed with `x_`
- unknown non-extension keys SHOULD trigger warning and MAY trigger rejection by strict mode
- reserved keys MUST NOT be repurposed

## Operational Validation Pipeline
Recommended order:
1. parse JSON
2. size check
3. secret scan
4. structural lint
5. schema validation (full, if optional validator is available)
6. dispatch/ingest

## References
- `docs/governance/Manual de Instruções: Protocolo CCP.md`
- `docs/governance/ccp/KEYS.md`
- `docs/governance/ccp/schema/`
- `docs/governance/ccp/tools/`
