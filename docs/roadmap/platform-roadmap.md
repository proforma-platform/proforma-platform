# Detalhamento de Itens do Roadmap

Este arquivo expande tarefas da fila principal (`ROADMAP.md`) quando o item exige
mais contexto técnico.

## Item: GOV-0004

- ID da tarefa: `GOV-0004`
- Descrição: Consolidar deploy Ubuntu com Docker + Traefik + Cloudflare
- Escopo: compose de produção, TLS DNS-01, documentação de operação, hardening mínimo de acesso ao n8n e isolamento para coexistir com serviços já ativos
- Critério de aceite: compose validado, instruções de operação publicadas e sem portas internas expostas externamente
- Status: `Done`

Referências:

- `infra/docker/docker-compose.prod.yml`
- `docs/runbooks/deploy-ubuntu-cloudflare.md`

## Item: GOV-0006

- ID da tarefa: `GOV-0006`
- Descrição: Definir política de versionamento e release
- Escopo: convenção semântica de versão, critérios de bump e checklist aplicado ao fluxo de PR
- Critério de aceite: processo documentado em runbook e incorporado no CONTRIBUTING/README
- Status: `Done`

Referências:

- `docs/runbooks/versioning-release.md`
- `CONTRIBUTING.md`
- `README.md`

## Item: GOV-0007

- ID da tarefa: `GOV-0007`
- Descrição: Expandir governança de segurança para portal
- Escopo: checklist de hardening, revisão de headers e política de incidentes
- Critério de aceite: documentação de segurança publicada e headers revisados no portal
- Status: `Done`

Referências:

- `docs/runbooks/portal-security-hardening.md`
- `docs/runbooks/security-incident-response.md`
- `apps/web-portal/next.config.ts`
- `SECURITY.md`

## Item: GOV-0008

- ID da tarefa: `GOV-0008`
- Descrição: Definir estratégia de SSO corporativo
- Escopo: modelo de integração futura com ERP, requisitos de sessão e plano de rollout sem autenticação real nesta fase
- Critério de aceite: runbook e ADR publicados, com limites de escopo explícitos
- Status: `Done`

Referências:

- `docs/runbooks/sso-erp-strategy.md`
- `docs/architecture/ADR-0004-estrategia-sso-portal-erp.md`

## Item: GOV-0009

- ID da tarefa: `GOV-0009`
- Descrição: Evoluir base de conhecimento integrada do portal
- Escopo: catálogo local de KB, navegação por artigos e documentação de evolução
- Critério de aceite: rotas `/portal/ajuda` e `/portal/ajuda/[slug]` operacionais e documentadas
- Status: `Done`

Referências:

- `apps/web-portal/src/lib/kb.ts`
- `apps/web-portal/src/app/portal/ajuda/page.tsx`
- `apps/web-portal/src/app/portal/ajuda/[slug]/page.tsx`
- `docs/runbooks/knowledge-base-integration.md`

## Item: GOV-0010

- ID da tarefa: `GOV-0010`
- Descrição: Definir SLO/SLA iniciais para web-public, web-portal e docs
- Escopo: baseline de metas de disponibilidade/latência, error budget e rotina de revisão
- Critério de aceite: runbook publicado com metas por serviço e processo de medição/revisão
- Status: `Done`

Referências:

- `docs/runbooks/slo-sla-baseline.md`

## Item: GOV-0011

- ID da tarefa: `GOV-0011`
- Descrição: Política de resposta a incidentes e comunicação operacional
- Escopo: classificação de severidade, RACI, SLA de resposta e templates de comunicação
- Critério de aceite: runbooks publicados e referência de governança no fluxo operacional
- Status: `Done`

Referências:

- `docs/runbooks/security-incident-response.md`
- `docs/runbooks/incident-communication-policy.md`

## Item: GOV-0012

- ID da tarefa: `GOV-0012`
- Descrição: Avaliar estratégia de preview environments por PR
- Escopo: modelo de ambientes efêmeros, segurança de isolamento e ciclo de vida
- Critério de aceite: runbook e ADR publicados com critérios de ativação futura
- Status: `Done`

Referências:

- `docs/runbooks/preview-environments-pr.md`
- `docs/architecture/ADR-0005-preview-environments-pr-strategy.md`

## Item: GOV-0013

- ID da tarefa: `GOV-0013`
- Descrição: Scorecard de arquitetura e segurança por fase
- Escopo: critérios, pesos, metas e processo de revisão por fase
- Critério de aceite: scorecard publicado com matriz de avaliação e regra de governança
- Status: `Done`

Referências:

- `docs/runbooks/architecture-security-scorecard.md`

## Item: GOV-0014

- ID da tarefa: `GOV-0014`
- Descrição: Estratégia de testes sintéticos para SLO em ambiente produtivo
- Escopo: cenários sintéticos, frequência, critérios de alerta e governança
- Critério de aceite: runbook publicado com estratégia operacional e limites iniciais
- Status: `Done`

Referências:

- `docs/runbooks/synthetic-slo-tests-strategy.md`
- `docs/runbooks/slo-sla-baseline.md`

## Item: GOV-0015

- ID da tarefa: `GOV-0015`
- Descrição: Política de retenção e anonimização de logs operacionais
- Escopo: classes de log, prazos de retenção, mascaramento e regras de expurgo
- Critério de aceite: runbook publicado com política aplicável e governança de revisão
- Status: `Done`

Referências:

- `docs/runbooks/log-retention-anonymization-policy.md`
- `docs/runbooks/security-incident-response.md`

## Item: GOV-0016

- ID da tarefa: `GOV-0016`
- Descrição: Plano de auditoria contínua de compliance técnico
- Escopo: cadência, checklist, evidências e tratamento de não conformidades
- Critério de aceite: runbook publicado com processo recorrente e classificação de NC
- Status: `Done`

Referências:

- `docs/runbooks/compliance-audit-continuous-plan.md`
- `docs/runbooks/architecture-security-scorecard.md`

## Item: GOV-0017

- ID da tarefa: `GOV-0017`
- Descrição: Matriz de risco por serviço e domínio funcional
- Escopo: classificação de risco, controles atuais e tratamento por domínio
- Critério de aceite: runbook publicado com matriz inicial e processo de revisão
- Status: `Done`

Referências:

- `docs/runbooks/risk-matrix-services-domains.md`
- `docs/runbooks/compliance-audit-continuous-plan.md`

## Item: GOV-0018

- ID da tarefa: `GOV-0018`
- Descrição: Política de classificação de dados por domínio de negócio
- Escopo: níveis de classificação, domínios, controles e regras de manuseio
- Critério de aceite: runbook publicado com política aplicável e governança de revisão
- Status: `Done`

Referências:

- `docs/runbooks/data-classification-policy.md`
- `docs/runbooks/log-retention-anonymization-policy.md`

## Item: GOV-0019

- ID da tarefa: `GOV-0019`
- Descrição: Plano de testes de recuperação de desastre para stack web
- Escopo: cenários de falha, metas RTO/RPO, evidências e critérios de aprovação
- Critério de aceite: runbook publicado com sequência de teste e governança de revisão
- Status: `Done`

Referências:

- `docs/runbooks/disaster-recovery-tests-plan.md`
- `docs/runbooks/deploy-ubuntu-cloudflare.md`

## Item: GOV-0020

- ID da tarefa: `GOV-0020`
- Descrição: Política de continuidade de negócio para canais web críticos
- Escopo: objetivos de continuidade, modos operacionais e critérios de retorno
- Critério de aceite: runbook publicado com governança e fluxo de ativação
- Status: `Done`

Referências:

- `docs/runbooks/business-continuity-web-channels.md`
- `docs/runbooks/disaster-recovery-tests-plan.md`
- `docs/runbooks/security-incident-response.md`

## Item: GOV-0021

- ID da tarefa: `GOV-0021`
- Descrição: Programa de exercícios de resposta a incidentes (tabletop)
- Escopo: cadência, papéis, cenários e métricas de aprendizado
- Critério de aceite: runbook publicado com rito operacional e saídas obrigatórias
- Status: `Done`

Referências:

- `docs/runbooks/tabletop-incident-exercises-program.md`
- `docs/runbooks/security-incident-response.md`
- `docs/runbooks/incident-communication-policy.md`

## Item: GOV-0022

- ID da tarefa: `GOV-0022`
- Descrição: Plano de comunicação externa de crise para canais web
- Escopo: gatilhos, papéis, templates e cadência de comunicação
- Critério de aceite: runbook publicado com protocolo completo e governança
- Status: `Done`

Referências:

- `docs/runbooks/external-crisis-communication-plan.md`
- `docs/runbooks/incident-communication-policy.md`
- `docs/runbooks/security-incident-response.md`

## Item: GOV-0023

- ID da tarefa: `GOV-0023`
- Descrição: Simulação anual integrada de continuidade e recuperação (DR drill)
- Escopo: orquestração de exercício anual, papéis, critérios de aceite e evidências
- Critério de aceite: runbook publicado com etapas, governança e rotina pós-exercício
- Status: `Done`

Referências:

- `docs/runbooks/annual-integrated-continuity-dr-drill.md`
- `docs/runbooks/disaster-recovery-tests-plan.md`
- `docs/runbooks/business-continuity-web-channels.md`
- `docs/runbooks/external-crisis-communication-plan.md`

## Item: GOV-0024

- ID da tarefa: `GOV-0024`
- Descrição: Modelo de treinamento de porta-voz técnico para crises
- Escopo: perfil, checklist, cadência e métricas de capacitação
- Critério de aceite: runbook publicado e alinhado aos protocolos de crise vigentes
- Status: `Done`

Referências:

- `docs/runbooks/technical-spokesperson-crisis-training.md`
- `docs/runbooks/external-crisis-communication-plan.md`
- `docs/runbooks/security-incident-response.md`
