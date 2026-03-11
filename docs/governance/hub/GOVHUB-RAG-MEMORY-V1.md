# GOVHUB RAG Memory V1

## Objetivo
Persistir contexto operacional em memória particionada para recuperar apenas o contexto relevante em novos chats e novas missões.

## Camadas
- Snapshot operacional: `gov_manager_context_memory_v1`
- Persistência alvo: Postgres `gov.memory_documents` + `gov.memory_chunks`
- Busca futura: pgvector + filtro por namespace/tags/mission_id

## Namespaces iniciais
- `gov_manager`
- `gov_operating_model`
- `gov_principal_architect`
- `n8n`
- `infra`

## Contrato operacional
### STORE
- action=`store`
- namespace
- topic
- content
- summary
- tags[]
- mission_id
- role
- actor
- source_type

### RETRIEVE
- action=`retrieve`
- query
- namespace
- mission_id
- role
- tags[]
- limit

## UDN recomendado
- `!G|MEM|STORE|...`
- `!G|MEM|GET|...`

## Regra
- Sempre salvar handoff crítico
- Sempre salvar identidade operacional do papel principal
- Recuperação deve filtrar por namespace antes de ranquear

## GOV UI
- Seção: `Memória Operacional`
- Ações:
  - consultar
  - gerar starter
  - salvar contexto
  - gerar backup
  - baixar exportação

## n8n templates
- `docs/governance/hub/n8n/workflows/gov-memory-store.json`
- `docs/governance/hub/n8n/workflows/gov-memory-starter.json`

## Guia de uso
- `docs/governance/hub/GOVHUB-RAG-MEMORY-GUIA-USO-V1.md`
