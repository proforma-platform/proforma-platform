# Runbook: Estratégia de Preview Environments por PR

## Objetivo

Definir modelo de ambientes de preview por Pull Request sem ativar implantação
automática nesta fase.

## Escopo

- Estratégia para `web-public`, `web-portal` e `docs`.
- Regras de segurança, custo e ciclo de vida.
- Critérios para adoção gradual futura.

## Modelo proposto

- Cada PR elegível gera ambiente efêmero isolado.
- URL padrão por PR (exemplo):
  - `pr-<id>.preview.proforma.net.br` (ou subdomínios por app)
- Infra preferencial via Docker com roteamento no proxy existente.
- Dados de preview sem conexão com bancos de produção.

## Critérios de elegibilidade

- PR com build passando.
- Alterações relevantes de frontend/docs.
- Sem necessidade de segredos de produção.

## Regras de segurança

- Sem acesso a Postgres de produção.
- Sem acesso a n8n produtivo.
- Variáveis de ambiente específicas de preview.
- TTL automático para remoção do ambiente após merge/close.

## Ciclo de vida

1. Criar preview ao abrir/atualizar PR (futuro).
2. Executar smoke checks básicos (futuro).
3. Destruir ambiente ao fechar PR (futuro).

## Custos e limites

- Limite de previews simultâneos.
- Priorizar PRs com impacto de UX/arquitetura visível.
- Reuso de imagens quando possível para reduzir tempo/custo.

## Critérios para ativação futura

- Pipeline estável com build previsível.
- Política de segurança de variáveis por ambiente definida.
- Mecanismo confiável de cleanup automático.

## Fora de escopo nesta fase

- Implementação automática de preview em CI/CD.
- Provisionamento real de infraestrutura.
