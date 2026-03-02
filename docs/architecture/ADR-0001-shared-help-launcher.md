# ADR-0001: HelpLauncher compartilhado em packages/ui

- Data: 2026-02-23
- Status: Aceito

## Contexto

A plataforma possui duas frentes web separadas (`web-public` e `web-portal`) com
necessidades distintas de suporte, mas com o mesmo padrão de interação para acesso
rápido à ajuda.

## Decisão

Implementar o `HelpLauncher` no workspace `packages/ui` em JavaScript/CSS sem
bibliotecas adicionais, com inicialização por função (`initHelpLauncher`) e
configurações de contexto (público/portal).

## Consequências

- Reuso entre Astro e Next sem trocar stack.
- Sanitização de texto e URL no componente para reduzir risco de XSS em conteúdo dinâmico.
- Evolução futura para integrações (KB, ticketing, ouvidoria) sem duplicação de lógica.
