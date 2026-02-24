# PROFORMA PLATFORM ROADMAP

Este é o roadmap oficial da plataforma.

---

## Fase Atual

Objetivo macro da fase: tangibilizar produtos no `apps/web-public` com governança, performance e baseline de qualidade.

### Em Execução

- [GOV-0031] Refinar páginas de produto com narrativa comercial orientada a conversão (Owner: Codex) – Status: In Progress

### Próximas (fila imediata)

- [GOV-0032] Publicar release `v0.3.0` com Product Pages + evidências de Lighthouse (Owner: Codex) – Status: Planned
- [GOV-0033] Consolidar baseline de SEO institucional (`title`, `description`, `og:*`) em todas as páginas públicas (Owner: Codex) – Status: Planned

---

## Estratégia de Fases

### FASE 1 — Infraestrutura & Governança

**Objetivo:** Fundação técnica e organizacional do projeto.

- Estrutura inicial do monorepo
- CI básico
- Docusaurus
- Governança formalizada

### FASE 2 — Identidade & Layout Institucional

**Objetivo:** Consolidar presença institucional com linguagem de produto enterprise.

- Brand system
- Hero institucional
- Layout reutilizável
- Product Pages base

### FASE 3 — Portal Base (Sem Auth Real)

**Objetivo:** Estruturar navegação funcional de portal antes de integrações reais.

- Estrutura inicial do web-portal
- Navegação básica
- Estrutura de layout interno

### FASE 4 — Integração Real

**Objetivo:** Integrar autenticação e serviços reais.

- Integração com serviços backend
- Autenticação real
- Integração com n8n
- Conexão com banco de dados

### FASE 5 — Hardening & Produção

**Objetivo:** Preparar ambiente e produto para operação em produção.

- Hardening de segurança
- Monitoramento
- Observabilidade
- Testes automatizados
- Performance tuning

---

## Backlog Prioritário

- [GOV-0034] Política de maturidade de resiliência por domínio de produto – Status: Planned

---

## Backlog Futuro

- Estratégias multi-tenant
- Integração com ERP legado
- Marketplace interno
- Automação comercial

---

## ✅ Concluído

- [GOV-0001] Estrutura inicial do monorepo + CI básico + Docusaurus – Commit: `ee40bc8`
- [GOV-0028] Formalização do Brand System Proforma (ADR + guidelines + tokens + assets) – Commit: `d511587`
- [GOV-0029] Product Pages v0.3.0 no `web-public` (`/produtos/proformafarm` e `/produtos/medcore`) + layout reutilizável – Commit: `6ed390d`
- [GOV-0030] Hotfix de governança com restauração do gate `npm run test` no root + task `turbo test` + validação Lighthouse – Commit: `6821133`

---

## Padrão de Tarefa Individual

Cada tarefa no roadmap deve seguir o padrão:

- ID único (ex: GOV-xxxx)
- Descrição clara e objetiva
- Owner definido
- Status atualizado (Planned / In Progress / Done)
- Commit SHA associado quando concluída
