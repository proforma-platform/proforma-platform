# GOVHUB RAG Memory - Guia de Utilização V1

## O que foi implantado
- API operacional de memória: `GET/POST /api/govhub/operations/memory`
- Snapshot operacional: `gov_manager_context_memory_v1`
- Tela no GOV: `Memória Operacional`
- Ações na tela:
  - consulta
  - starter
  - salvar contexto
  - backup
  - download

## Uso no GOV
### Consulta
- Abrir `Memória`
- Informar:
  - `namespace`
  - `consulta`
  - opcional: `missão`, `role`, `tags`
- Acionar `Consultar memória`

### Starter para novo chat
- Informar `namespace` e `consulta`
- Acionar `Starter`
- O payload retornará `starter_text` em UDN curto

### Salvar contexto
- Informar:
  - `namespace`
  - `tópico`
  - `resumo`
  - `conteúdo`
  - opcional: `missão`, `role`, `tags`
- Acionar `Salvar memória`

### Backup e download
- `Backup`: baixa o snapshot atual como artefato de preservação
- `Download`: baixa a exportação do snapshot para análise/local restore

## Namespaces recomendados
- `gov_principal_architect`
- `gov_manager`
- `gov_operating_model`
- `n8n`
- `infra`

## Contratos UDN
### Store
```text
!G|MEM|STORE|T=<ISO>;
#NS:<namespace>;
#TOP:<topic>;
#SUM:<summary>;
#MIS:<mission_id>;
#ROLE:<role>;
#TAGS:<tag1,tag2>;
#CNT:<content>;
#E;
```

### Retrieve
```text
!G|MEM|GET|T=<ISO>;
#Q:<query>;
#NS:<namespace>;
#MIS:<mission_id>;
#ROLE:<role>;
#TAGS:<tag1,tag2>;
#L:<limit>;
#E;
```

### Starter
```text
!G|MEM|STARTER|T=<ISO>;
#Q:<query>;
#NS:<namespace>;
#R1:<namespace>|<topic>|<summary>;
#E;
```

## Integração n8n
- workflow template: `docs/governance/hub/n8n/workflows/gov-memory-store.json`
- workflow template: `docs/governance/hub/n8n/workflows/gov-memory-starter.json`
- workflow template: `docs/governance/hub/n8n/workflows/gov-memory-retrieve.json`

Uso recomendado:
1. fim de sessão -> `store`
2. início de novo chat -> `starter`
3. consulta específica -> `retrieve`

## Limites atuais
- busca híbrida lexical + metadados
- embeddings/pgvector ainda não ligados em produção
- snapshot continua sendo a fonte operacional ativa
