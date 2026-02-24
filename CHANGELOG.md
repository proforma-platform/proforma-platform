# Changelog

## [Unreleased]

### Added

- Runbooks operacionais de deploy/infra/SSL em `docs/ops/` para ambiente Nginx + Cloudflare.
- ADR-0007 formalizando governança de documentação de operação e deploy.
- Workspace `@proforma/design-system` com tokens semânticos, contratos tipados de componentes e tema TypeScript.
- Componentes base do Design System Foundations em `@proforma/design-system`: `Typography`, `Button`, `Card` e `Container`.
- Documento de referência do núcleo do design system em `docs/design-system/core.md`.
- ADR de design system core para governança de evolução de UI compartilhada.

- Novo modelo Founder Mode em `ROADMAP.md` com estrutura hierárquica por fase.
- Documento de processo de fila em `docs/roadmap/processo-desenvolvimento.md`.
- ADR de governança por fases em `docs/architecture/ADR-0002-estrategia-fases-governanca.md`.
- Runbook de hardening do portal em `docs/runbooks/portal-security-hardening.md`.
- Runbook de resposta a incidentes em `docs/runbooks/security-incident-response.md`.
- Runbook de estratégia SSO com ERP em `docs/runbooks/sso-erp-strategy.md`.
- ADR de estratégia de SSO em `docs/architecture/ADR-0004-estrategia-sso-portal-erp.md`.
- Runbook da base de conhecimento integrada em `docs/runbooks/knowledge-base-integration.md`.
- Estrutura de artigos de KB no portal em `apps/web-portal/src/lib/kb.ts` e rotas `/portal/ajuda/[slug]`.
- Baseline de SLO/SLA para `web-public`, `web-portal` e `docs` em `docs/runbooks/slo-sla-baseline.md`.
- Política de comunicação de incidentes em `docs/runbooks/incident-communication-policy.md`.
- Estratégia de preview environments por PR em `docs/runbooks/preview-environments-pr.md`.
- ADR da estratégia de preview por PR em `docs/architecture/ADR-0005-preview-environments-pr-strategy.md`.
- Scorecard de arquitetura e segurança por fase em `docs/runbooks/architecture-security-scorecard.md`.
- Estratégia de testes sintéticos para SLO em produção em `docs/runbooks/synthetic-slo-tests-strategy.md`.
- Política de retenção e anonimização de logs operacionais em `docs/runbooks/log-retention-anonymization-policy.md`.
- Plano de auditoria contínua de compliance técnico em `docs/runbooks/compliance-audit-continuous-plan.md`.
- Matriz de risco por serviço e domínio funcional em `docs/runbooks/risk-matrix-services-domains.md`.
- ADR de arquitetura de marca Branded House em `docs/architecture/ADR-0003-brand-architecture.md`.
- Guidelines visuais de marca em `docs/brand/visual-guidelines.md`.
- Pacote `@proforma/brand` com tokens e placeholders de identidade em `packages/brand/`.
- Política de classificação de dados por domínio de negócio em `docs/runbooks/data-classification-policy.md`.
- Plano de testes de recuperação de desastre da stack web em `docs/runbooks/disaster-recovery-tests-plan.md`.
- Política de continuidade de negócio para canais web críticos em `docs/runbooks/business-continuity-web-channels.md`.
- Programa de exercícios tabletop de incidentes em `docs/runbooks/tabletop-incident-exercises-program.md`.
- Plano de comunicação externa de crise para canais web em `docs/runbooks/external-crisis-communication-plan.md`.
- Runbook de simulação anual integrada de continuidade e recuperação em `docs/runbooks/annual-integrated-continuity-dr-drill.md`.
- Runbook de treinamento de porta-voz técnico para crises em `docs/runbooks/technical-spokesperson-crisis-training.md`.

### Changed

- Deploy manual do `web-public` documentado no runbook operacional com evidências de validação HTTP (`200` em `/` e `301` esperados para slash final em `/proformafarm` e `/medcore`).
- `apps/web-public`, `apps/web-portal` e `docs/docusaurus` passaram a consumir tokens via `@proforma/design-system/tokens.css`.
- `apps/web-public/src/pages/index.astro` integrado de forma incremental com os componentes base do design system.
- `packages/ui/src/help-launcher.css` atualizado para consumir tokens semânticos (cores, foco, superfície e z-index).
- `README.md` e `ROADMAP.md` atualizados para refletir a trilha de Design System Core.
- `README.md` atualizado com regra operacional: nenhuma tarefa fora da fase atual.
- ADR de layout institucional renumerada para `ADR-0003` para preservar histórico após formalização da ADR-0002 de governança.
- `apps/web-portal/next.config.ts` revisado com headers adicionais de segurança.
- `apps/web-portal/src/app/portal/ajuda/page.tsx` evoluída para listar artigos e categorias da KB.
- `apps/web-portal/src/app/globals.css` atualizado com estilos da central de conhecimento.
- `SECURITY.md` atualizado com referências formais de hardening e incident response.
- `docs/runbooks/security-incident-response.md` expandido com severidade (SEV), RACI e SLA interno de resposta.
- `ROADMAP.md` atualizado na Fase 2 com itens de identidade (logo SVG, kit de banners e aplicação no `web-public`).
- `README.md` atualizado com arquitetura de marca e localização de tokens/guidelines.
- `ROADMAP.md` e `docs/roadmap/platform-roadmap.md` atualizados para concluir `GOV-0007` até `GOV-0024` e avançar fila para `GOV-0025`.

### Fixed

- Organização do roadmap para evitar execução paralela de temas de infra, layout, portal, segurança e SEO no mesmo ciclo.
