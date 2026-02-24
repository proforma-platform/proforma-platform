# Cloudflare + Nginx + SSL

## Modo SSL

Operar com **Cloudflare SSL/TLS: Full (strict)**.

## Certificado de Origem

No Nginx atual, o certificado configurado é de origem Cloudflare:

- `ssl_certificate /etc/ssl/cloudflare/origin.pem`
- `ssl_certificate_key /etc/ssl/cloudflare/origin.key`

Observação: não versionar conteúdo do certificado/chave.

## Trecho relevante de Nginx (resumo)

- `listen 80` com `return 301 https://$host$request_uri`
- `listen 443 ssl http2`
- `server_name proforma.net.br www.proforma.net.br`
- `root /var/www/proforma-web-public`
- `try_files $uri $uri/ /index.html`

Para n8n:
- `server_name n8n.proforma.net.br`
- `proxy_pass http://127.0.0.1:5678`
- `auth_basic` habilitado

## Cache

Regras de cache específicas não foram identificadas no vhost atual (sem blocos `proxy_cache`/`expires` dedicados no trecho analisado).

## Headers relevantes

Observados no vhost público:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Invalidação de cache (Cloudflare)

Quando necessário:
1. Cloudflare Dashboard -> Caching -> Purge Cache
2. Preferir purge por URL para minimizar impacto
3. Em incidentes, purge total

## Validação de SSL e Headers

```bash
curl -I https://proforma.net.br/
curl -I https://proforma.net.br/proformafarm
curl -I https://n8n.proforma.net.br/
```

```bash
openssl s_client -connect proforma.net.br:443 -servername proforma.net.br </dev/null
```

## Coleta da config completa (com privilégio)

Para auditoria técnica completa no servidor:

```bash
sudo nginx -T
```

Se o ambiente exigir senha/sudo interativo, executar manualmente por operador autorizado e anexar extratos redigidos (sem segredos) ao PR de operação.
