# ADR-0007 — Padronização de Deploy e Operação (Nginx + Cloudflare)

## Status

Accepted

## Contexto

A plataforma evoluiu em governança, design system e releases, mas faltava documentação operacional consolidada do ambiente real de publicação (`Nginx + Cloudflare`). Isso gera risco de drift entre merge/tag e estado efetivo em produção.

## Decisão

Padronizar documentação de operação e deploy com três documentos oficiais:

- `docs/ops/DEPLOYMENT-RUNBOOK.md`
- `docs/ops/INFRA-TOPOLOGY.md`
- `docs/ops/CLOUDFLARE-NGINX-SSL.md`

A partir desta decisão, releases devem incluir evidência operacional mínima (build, publish, validação de rotas/headers).

## Consequências

- Operação deixa de ser implícita e passa a ser auditável.
- Fica explícito que merge/tag no GitHub não publica automaticamente o site.
- Procedimento de rollback e troubleshooting fica reproduzível.
- Documentação operacional passa a compor o DoD de release quando houver impacto no canal público.
