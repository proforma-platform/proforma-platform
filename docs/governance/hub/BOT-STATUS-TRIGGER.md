# BOT Status Trigger

Objetivo: disparar execução dos workflows de bot e validar publicação no endpoint de status.

Checklist rápido:
- Abrir/atualizar PR em branch de feature.
- Confirmar execução dos workflows `GOVHUB Auto PR` e `GOVHUB Auto Approve`.
- Validar `GET /api/govhub/bots/status` com `rows` preenchido.
