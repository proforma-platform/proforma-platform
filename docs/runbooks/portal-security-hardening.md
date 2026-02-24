# Runbook: Portal Security Hardening

## Objetivo

Estabelecer checklist mínimo de hardening para o `apps/web-portal` sem alterar arquitetura
ou introduzir dependências adicionais.

## Escopo

- Headers de segurança da aplicação Next.js.
- Práticas de tratamento de conteúdo exibido no portal.
- Regras mínimas para operação segura em ambiente Ubuntu + Traefik + Cloudflare.

## Checklist de Hardening

### Aplicação (web-portal)

- [x] `Content-Security-Policy` configurada.
- [x] `X-Frame-Options: DENY`.
- [x] `X-Content-Type-Options: nosniff`.
- [x] `Referrer-Policy` definida.
- [x] `Permissions-Policy` restritiva.
- [x] `Strict-Transport-Security` habilitada para HTTPS.
- [x] `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy` configuradas.
- [x] Ausência de segredos no frontend.

### Operação

- [x] Exposição externa restrita ao Traefik (80/443).
- [x] Portal sem autenticação real nesta fase (sem credenciais de produção).
- [x] Deploy orientado por runbook, sem automações destrutivas.

### Conteúdo e UX

- [x] Separação clara entre área pública e portal.
- [x] Componentes compartilhados com sanitização de conteúdo dinâmico.

## Verificação rápida

1. Build local:
   - `npm run build`
2. Inspecionar headers em ambiente publicado:
   - `curl -I https://portal.proforma.net.br`
3. Confirmar ausência de portas extras publicadas:
   - `docker ps --format 'table {{.Names}}\t{{.Ports}}'`

## Limites deste hardening

- Não inclui autenticação/SSO real (fase futura).
- Não inclui rate limit por aplicação (deve ser reforçado no proxy/camada edge).
- Não inclui WAF dedicado no app.
