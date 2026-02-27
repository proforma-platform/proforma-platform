# GOVHUB Client: fetch-mission

Client oficial para consultar o endpoint canônico de despacho de missões no GOVHUB.

## WAF/Cloudflare constraint

Use somente transportes compatíveis com WAF no runtime atual:
- Bash: `curl`
- PowerShell: `Invoke-RestMethod`

Não usar cliente HTTP Node (`fetch`/`axios`) neste fluxo.

## Endpoint

- Method: `POST`
- URL: `https://govhub.proforma.net.br/webhook/govhub/missions/next`
- Headers:
  - `X-GOVHUB-TOKEN`
  - `Content-Type: application/json`

## Token loading

Prioridade:
1. Arquivo: `$HOME/.config/proforma/secrets.env`
   - Deve conter `GOVHUB_TOKEN=...`
   - Permissões obrigatórias: `<= 0600`
   - Normalização aplicada: remove CR, trim, remove aspas externas
2. Fallback: env `GOVHUB_TOKEN` (somente se o arquivo não existir)

## Uso (bash)

```bash
bash docs/governance/hub/clients/fetch-mission/fetch-mission.sh \
  --repo-key platform \
  --agent-id cpp-runtime-test
```

Com arquivo de saída:

```bash
bash docs/governance/hub/clients/fetch-mission/fetch-mission.sh \
  --repo-key platform \
  --agent-id cpp-runtime-test \
  --output-file /tmp/mission.json
```

## Uso (PowerShell)

```powershell
pwsh docs/governance/hub/clients/fetch-mission/fetch-mission.ps1 \
  -RepoKey platform \
  -AgentId cpp-runtime-test
```

## Comportamento

- Sucesso:
  - `stdout`: JSON de resposta compacto
  - `stderr`: resumo curto (`repo_key`, `agent_id`, `http_status`, `status`, `mission_key`, `lock_expires_at_utc`)
- Falha:
  - exit code `1`
  - `stderr`: status HTTP e `error_preview` truncado (máx. 1200 chars)
