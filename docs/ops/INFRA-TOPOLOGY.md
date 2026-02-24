# Infra Topology (Nginx + Cloudflare)

## Diagrama Textual

```text
[Client Browser]
      |
      v
[Cloudflare Edge]
  - DNS proxied
  - SSL/TLS
      |
      v
[Nginx on Ubuntu]
  - proforma.net.br / www.proforma.net.br -> static root
  - n8n.proforma.net.br -> reverse proxy + basic auth
      |
      +--> /var/www/proforma-web-public (Astro static files)
      |
      +--> 127.0.0.1:5678 (n8n upstream)
```

## Subdomínios e Função (estado observado)

- `proforma.net.br`: site institucional (`web-public` estático)
- `www.proforma.net.br`: alias do site institucional
- `n8n.proforma.net.br`: proxy para n8n interno (`127.0.0.1:5678`) com auth básica

Subdomínios adicionais podem existir no Cloudflare, mas este documento reflete o que foi observado na configuração ativa do Nginx no host.

## Portas

Externas:
- `80/tcp`: redirecionamento para HTTPS
- `443/tcp`: tráfego TLS

Internas:
- `127.0.0.1:5678`: n8n upstream (não exposto diretamente)

## Diretórios Relevantes

- Nginx sites enabled: `/etc/nginx/sites-enabled`
- Nginx sites available: `/etc/nginx/sites-available`
- Root estático do `web-public`: `/var/www/proforma-web-public`

## Logs

- Nginx access log: `/var/log/nginx/access.log`
- Nginx error log: `/var/log/nginx/error.log`

Se houver logs por vhost customizados, registrar no momento da mudança do servidor.
