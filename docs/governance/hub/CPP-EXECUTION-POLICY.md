# CPP Execution Policy
## Purpose
This policy defines execution behavior for CODEX Proforma Platform (CPP) in governance missions to reduce operator friction while preserving security and auditability.

## Default Mode
CPP MUST run in `STANDARD` mode by default.

`STANDARD` mode rules:
- CPP MUST NOT request elevation for routine execution.
- CPP MUST execute allowlisted commands directly, without interactive confirmation.
- CPP MUST attempt non-privileged fallbacks before any elevated path.

## Privilege Mode
CPP MAY use elevated operations only when mission input explicitly declares:
- `PRIVILEGE_MODE=ELEVATED_ALLOWED`

If `PRIVILEGE_MODE=ELEVATED_ALLOWED` is absent, CPP MUST remain in `STANDARD` mode.

## Allowed Commands (No Confirmation)
The following categories are allowlisted for non-elevated execution:
- Git metadata and sync commands:
  - `git fetch`
  - `git pull`
  - `git status`
  - `git rev-parse`
  - `git log`
  - `git merge-base`
  - `git branch`
- GOVHUB endpoint calls with canonical URLs:
  - `curl` `HEAD`/`GET`/`POST`
- Secret file read and validation:
  - read `~/.config/proforma/secrets.env`
  - permission check and parse without value disclosure
- Local file text processing:
  - `grep`, `awk`, `sed`, `jq`
- UBIN processing and integrity tooling:
  - `openssl`, `sha256sum`, `gzip`, `base64`
- Network diagnostics:
  - `getent`, `nslookup`, `resolvectl`, `ping`, `nc`, `ss`

## Requires Explicit `ELEVATED_ALLOWED`
The following actions are prohibited in `STANDARD` mode and require explicit privilege mode:
- editing `/etc/resolv.conf`
- systemd/service reconfiguration or restarts
- firewall rule changes
- `docker exec` into runtime services for operational mutation
- direct database migration apply in runtime environments
- restart of production services

## Mandatory Fallback Before Elevation
Before requesting elevation, CPP MUST execute non-privileged fallback diagnostics.

For remote git fetch failures:
1. attempt: `git fetch origin --prune`
2. if DNS/network error occurs, collect evidence using allowlisted diagnostics (`getent`, `nslookup`, `resolvectl`)
3. return structured `ccp_error` with `stage=DNS`
4. STOP without elevation unless mission explicitly sets `PRIVILEGE_MODE=ELEVATED_ALLOWED`

## Logging and Output Safety Rules
CPP MUST follow these logging controls:
- MUST NOT log tokens or secret values.
- MUST truncate `error_preview` to at most 1200 characters.
- MUST NOT print response body on successful operations unless mission contract explicitly requires structured output fields.
- SHOULD log only status, checksum, IDs, and non-sensitive metadata.

## Compliance
Any deviation from this policy MUST be reported as governance non-conformity in mission output.
