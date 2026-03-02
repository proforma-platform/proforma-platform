# Security

## Escopo atual

Este repositório contém site público, portal e documentação institucional.

## Diretrizes aplicadas

- Separação entre superfície pública e portal.
- Headers de segurança configurados no portal (`CSP`, `frame-ancestors`, HSTS e políticas de origem).
- Sem uso de segredos no código do frontend.
- Sem autenticação real neste estágio.
- Componente compartilhado (`HelpLauncher`) com sanitização de texto e URL.

## Governança de hardening

- Checklist oficial do portal: `docs/runbooks/portal-security-hardening.md`.
- Política de resposta a incidentes: `docs/runbooks/security-incident-response.md`.
- Toda ação corretiva relevante deve ser registrada no `ROADMAP.md` e no `CHANGELOG.md`.

## Reporte de vulnerabilidades

Enviar relato para o canal interno de segurança do grupo com:

- Contexto do achado
- Passos de reprodução
- Impacto esperado
- Evidências (logs/capturas)

## Endurecimento futuro

- Revisão contínua de CSP no reverse proxy Ubuntu.
- Integração futura com identidade corporativa (SSO).
- Verificações automatizadas de segurança no pipeline.
- Reforço de rate limiting e proteção em camada edge.
