# PROFORMA PLATFORM ROADMAP

Este é o roadmap oficial da plataforma.

## 🎯 Fase Atual
Objetivo macro da fase: tangibilizar produtos no `apps/web-public` com governança, performance e baseline de qualidade.

### 🔵 Em Execução
- [GOV-0031] Refinar páginas de produto com narrativa comercial orientada a conversão (Owner: Codex) – Status: In Progress

### 🟡 Próximas (fila imediata)
- [GOV-0032] Publicar release `v0.3.0` com Product Pages + evidências de Lighthouse (Owner: Codex) – Status: Planned
- [GOV-0033] Consolidar baseline de SEO institucional (`title`, `description`, `og:*`) em todas as páginas públicas (Owner: Codex) – Status: Planned

---

## 🧱 Estratégia de Fases

### 🟦 FASE 1 — Infraestrutura & Governança
**Objetivo**
Fundação técnica e organizacional do projeto.

**Tarefas iniciais**
- Monorepo estruturado
- CI funcionando
- Docusaurus ativo
- Roadmap formal
- ADR formal
- Docker + Traefik configurado
- Cloudflare alinhado
- n8n protegido

**Em Execução**
- Nenhuma

**Backlog**
- Ajustes incrementais de runbooks e padronização operacional

### 🟩 FASE 2 — Identidade & Layout Institucional
**Objetivo**
Consolidar presença institucional com linguagem de produto enterprise.

**Tarefas iniciais**
- Layout base institucional
- Hero multi-produto
- Página de produtos
- Páginas ProformaFarm / MedCore
- Páginas Segurança / Arquitetura / Evolução
- HelpLauncher público
- Logo final em SVG (lockups e símbolo)
- Kit de banners institucionais (site e social)
- Aplicação consistente de marca no `apps/web-public`

**Em Execução**
- Nenhuma

**Backlog**
- Evolução visual e narrativa institucional orientada a conversão
- Revisão periódica de aderência aos brand tokens
- Manutenção do Brand System (`packages/brand`, ADR e guidelines)

### 🟨 FASE 3 — Portal Base (Sem Auth Real)
**Objetivo**
Estruturar navegação funcional de portal antes de integrações reais.

**Tarefas iniciais**
- Layout do portal
- Rotas base estruturadas
- Placeholder de autenticação
- HelpLauncher contextual

**Em Execução**
- Nenhuma

**Backlog**
- Revisões de UX do portal sem integração com backend real

### 🟧 FASE 4 — Integração Real
**Objetivo**
Conectar o portal ao ecossistema operacional existente com segurança.

**Tarefas iniciais**
- SSO com ERP
- Estratégia de conexão futura com Postgres existente
- Suporte real e ouvidoria persistente
- Integração com n8n
- Observabilidade

**Em Execução**
- Nenhuma

**Backlog**
- Plano de migração por etapas para integrações produtivas

### 🟥 FASE 5 — Hardening & Produção
**Objetivo**
Elevar maturidade operacional e segurança para produção contínua.

**Tarefas iniciais**
- Headers de segurança avançados
- Rate limiting
- CSP rigoroso
- Lighthouse >= 95
- Testes automatizados
- Logs estruturados
- Monitoramento

**Em Execução**
- [GOV-0025] Programa de revisão cruzada de incidentes com áreas de negócio (Owner: Codex) – Status: In Progress

**Backlog**
- Playbooks de incidentes e auditoria contínua

---

## 🧭 Backlog Prioritário
Itens importantes, mas não imediatos.

- [GOV-0034] Política de maturidade de resiliência por domínio de produto – Status: Planned

---

## 🧪 Backlog Futuro
Ideias estratégicas, não executáveis ainda.

- [GOV-0027] Estratégia de validação anual de governança por auditoria externa independente – Status: Planned

---

## ✅ Concluído
Itens finalizados com referência ao commit.

- [GOV-0001] Estrutura inicial do monorepo + CI básico + Docusaurus – Commit: `ee40bc8`
- [GOV-0004] Deploy Ubuntu com Docker + Traefik + Cloudflare (com isolamento) – Commit: `working-tree` (aguardando commit)
- [GOV-0005] Sistema formal de governança documental – Commit: `working-tree` (aguardando commit)
- [GOV-0006] Política de versionamento e release – Commit: `working-tree` (aguardando commit)
- [GOV-0007] Governança de segurança do portal (checklist + incident response + revisão de headers) – Commit: `working-tree` (aguardando commit)
- [GOV-0008] Estratégia de SSO corporativo (ADR + runbook, sem implementação de auth real) – Commit: `working-tree` (aguardando commit)
- [GOV-0009] Evolução da base de conhecimento integrada (`/portal/ajuda` + artigos locais) – Commit: `working-tree` (aguardando commit)
- [GOV-0010] Baseline de SLO/SLA para web-public, web-portal e docs – Commit: `working-tree` (aguardando commit)
- [GOV-0011] Política de incidentes e comunicação operacional (severidade, RACI, templates) – Commit: `working-tree` (aguardando commit)
- [GOV-0012] Estratégia de preview environments por PR (runbook + ADR) – Commit: `working-tree` (aguardando commit)
- [GOV-0013] Scorecard de arquitetura e segurança por fase – Commit: `working-tree` (aguardando commit)
- [GOV-0014] Estratégia de testes sintéticos para SLO em ambiente produtivo – Commit: `working-tree` (aguardando commit)
- [GOV-0015] Política de retenção e anonimização de logs operacionais – Commit: `working-tree` (aguardando commit)
- [GOV-0016] Plano de auditoria contínua de compliance técnico – Commit: `working-tree` (aguardando commit)
- [GOV-0017] Matriz de risco por serviço e domínio funcional – Commit: `working-tree` (aguardando commit)
- [GOV-0018] Política de classificação de dados por domínio de negócio – Commit: `working-tree` (aguardando commit)
- [GOV-0019] Plano de testes de recuperação de desastre para stack web – Commit: `working-tree` (aguardando commit)
- [GOV-0020] Política de continuidade de negócio para canais web críticos – Commit: `working-tree` (aguardando commit)
- [GOV-0021] Programa de exercícios de resposta a incidentes (tabletop) – Commit: `working-tree` (aguardando commit)
- [GOV-0022] Plano de comunicação externa de crise para canais web – Commit: `working-tree` (aguardando commit)
- [GOV-0023] Simulação anual integrada de continuidade e recuperação (DR drill) – Commit: `working-tree` (aguardando commit)
- [GOV-0024] Modelo de treinamento de porta-voz técnico para crises – Commit: `working-tree` (aguardando commit)
- [GOV-0028] Formalização do Brand System Proforma (ADR + guidelines + tokens + assets) – Commit: `d511587`
- [GOV-0029] Product Pages v0.3.0 no `web-public` (`/produtos/proformafarm` e `/produtos/medcore`) + layout reutilizável – Commit: `6ed390d`
- [GOV-0030] Hotfix de governança com restauração do gate `npm run test` no root + task `turbo test` + validação Lighthouse – Commit: `6821133`

---

## 📌 Padrão de Tarefa Individual

### [ID-001] Nome da Tarefa

**Objetivo**
Explicação clara do problema.

**Escopo**
Arquivos afetados:
- apps/...
- docs/...
- infra/...

**Critério de Aceite**
- `npm run build` passa
- Documentação atualizada
- Nenhuma dependência nova desnecessária

**Riscos**
- Impacto na arquitetura?
- Segurança?
- SEO?
