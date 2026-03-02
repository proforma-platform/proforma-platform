# Worker Self-Hosted (Template)

Template base para agentes de execucao no GOV-HUB (`CPP`, `CPP-IA`, futuros workers), com suporte opcional a GitOps.

## Contrato HTTP
- `GET /health` -> status do worker
- `POST /run` -> recebe tarefa da missao

Payload minimo em `/run`:
```json
{
  "mission_id": "GOV-EXAMPLE-01",
  "task_id": "task-01",
  "udn_block": "!MIS|..."
}
```

Payload com `git_ops` opcional:
```json
{
  "mission_id": "GOV-EXAMPLE-02",
  "task_id": "task-git",
  "git_ops": {
    "repo_path": "/workspace/proforma-platform",
    "branch": "feat/gov-123",
    "base_branch": "main",
    "remote": "origin",
    "commit_message": "feat: aplicar ajuste da missao GOV-123",
    "fetch_remote": true,
    "stage_all": true,
    "push": true
  }
}
```

Regras:
- Se `git_ops` nao for enviado, o worker responde no modo simples (`accepted`) e segue fluxo normal.
- Se `git_ops` for enviado e `GITOPS_ENABLED=false`, o worker retorna erro controlado `GITOPS_DISABLED`.

## Deploy (Docker)
```bash
docker build -t govhub-cpp-ia-worker:local .
docker run -d --name govhub-cpp-ia-worker \
  --restart unless-stopped \
  --network tmp_govhub-network \
  -p 15710:8080 \
  -e WORKER_ID=CPP-IA \
  -e WORKER_ROLE=analysis \
  -e GITOPS_ENABLED=true \
  -e GITOPS_ALLOWED_BASE=/workspace \
  -v /opt/proforma:/workspace \
  govhub-cpp-ia-worker:local
```

## Variaveis de ambiente GitOps
- `GITOPS_ENABLED` (`true|false`, padrao `false`)
- `GITOPS_ALLOWED_BASE` (raiz permitida para `repo_path`, padrao `/workspace`)
- `GITOPS_DEFAULT_REMOTE` (padrao `origin`)
- `GITOPS_DEFAULT_BASE_BRANCH` (padrao `main`)
- `GITOPS_TIMEOUT_SECONDS` (padrao `20`)

Observacao de operacao:
- Se o container nao tiver credencial/chave para o remoto, use `fetch_remote=false` para operar em branch local.

Politica de seguranca:
- fail-closed em `repo_path` fora de `GITOPS_ALLOWED_BASE`
- validacao estrita de `branch`, `base_branch`, `remote` e `commit_message`
- timeout por comando para evitar travamentos
- sem log de segredos/tokens em stdout do worker

## Reuso para outros workers
Use o mesmo codigo e altere apenas:
- `WORKER_ID` (ex.: `CPP`, `CPP-IA`, `CPP-OPS`)
- `WORKER_ROLE` (ex.: `execution`, `analysis`, `ops`)
- porta publicada (`-p`)

Exemplo:
```bash
docker run -d --name govhub-cpp-worker \
  --restart unless-stopped \
  --network tmp_govhub-network \
  -p 15711:8080 \
  -e WORKER_ID=CPP \
  -e WORKER_ROLE=execution \
  -e GITOPS_ENABLED=true \
  -e GITOPS_ALLOWED_BASE=/workspace \
  -v /opt/proforma:/workspace \
  govhub-cpp-ia-worker:local
```
