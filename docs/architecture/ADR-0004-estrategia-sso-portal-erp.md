# ADR-0004: Estratégia de SSO entre Portal e ERP

- Data: 2026-02-24
- Status: Accepted

## Contexto

O portal precisa evoluir para autenticação corporativa sem quebrar a separação
entre site público e área do cliente. O ambiente já possui ecossistema ERP,
Postgres e n8n ativos, exigindo integração com baixo risco operacional.

## Decisão

Adotar estratégia de SSO baseada em OIDC (Authorization Code + PKCE) para futura
integração do `apps/web-portal` com o provedor de identidade corporativo do ERP,
com rollout gradual por tenants e sem ativação de autenticação real nesta fase.

## Consequências

- Mantém o portal preparado para identidade corporativa sem implementar auth precoce.
- Reduz risco de acoplamento indevido com frontend e exposição de tokens.
- Exige definição formal de claims, papéis e governança de sessão antes do rollout.
