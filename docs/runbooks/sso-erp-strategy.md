# Runbook: Estratégia de SSO com ERP (Sem Implementação Nesta Fase)

## Objetivo

Definir a estratégia de integração futura de autenticação única (SSO) entre o
`apps/web-portal` e o ecossistema do ERP, sem ativar autenticação real nesta fase.

## Princípios

- Não introduzir autenticação funcional no portal nesta etapa.
- Reaproveitar o provedor de identidade corporativo do ERP quando disponível.
- Minimizar impacto em UX e evitar lock-in prematuro.

## Modelo proposto

- Fluxo recomendado: OIDC Authorization Code + PKCE.
- Sessão do portal baseada em cookie `HttpOnly`, `Secure`, `SameSite=Lax`.
- Tokens de acesso não expostos ao frontend quando possível.
- Claims mínimas: `sub`, `tenant_id`, `roles`, `email`.

## Fases de implementação futura

1. **Preparação**
   - Definir contrato de claims e mapeamento de papéis.
   - Definir domínios/callbacks por ambiente.
2. **Integração controlada**
   - Implementar login/logout e callback em ambiente controlado.
   - Validar sessões, expiração e revogação.
3. **Rollout gradual**
   - Ativar por grupos de tenant.
   - Medir erros de autenticação e impacto operacional.

## Requisitos de segurança

- Rotação e armazenamento seguro de segredos no ambiente de execução.
- Proteção contra replay/CSRF no fluxo de callback.
- Auditoria de login/logout e falhas de autenticação.

## Fora de escopo nesta fase

- Implementação de autenticação real no `web-portal`.
- Provisionamento automático de usuários.
- Sincronização de permissões em tempo real.
