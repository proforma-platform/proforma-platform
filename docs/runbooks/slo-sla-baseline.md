# Runbook: Baseline de SLO/SLA (web-public, web-portal, docs)

## Objetivo

Definir metas iniciais de disponibilidade e tempo de resposta para os serviços
web da plataforma, com governança operacional sem dependências adicionais.

## Escopo

- `web-public` (`proforma.net.br`)
- `web-portal` (`portal.proforma.net.br`)
- `docs` (`docs.proforma.net.br`)

## Definições

- **SLI**: indicador observado (ex.: disponibilidade, latência).
- **SLO**: meta alvo para o SLI.
- **SLA**: compromisso operacional adotado internamente nesta fase.
- **Error Budget**: margem de erro permitida por período.

## Metas iniciais (mensal)

### web-public

- Disponibilidade (SLI): respostas 2xx/3xx no endpoint raiz
- SLO: 99.5%
- SLO de latência: p95 <= 800ms
- Error budget mensal: 0.5%

### web-portal

- Disponibilidade (SLI): respostas 2xx/3xx em `/portal`
- SLO: 99.0%
- SLO de latência: p95 <= 1200ms
- Error budget mensal: 1.0%

### docs

- Disponibilidade (SLI): respostas 2xx/3xx no endpoint raiz de docs
- SLO: 99.5%
- SLO de latência: p95 <= 1000ms
- Error budget mensal: 0.5%

## Método de medição inicial

- Verificação ativa periódica por `curl -I` dos hosts oficiais.
- Registro em job operacional (cron/monitoramento existente) sem expor segredos.
- Consolidação mensal em relatório operacional interno.

## SLA inicial (interno)

- Incidente crítico em serviço público: resposta inicial em até 30 minutos úteis.
- Incidente crítico em portal: resposta inicial em até 30 minutos úteis.
- Comunicação de status: atualização a cada 60 minutos durante incidente ativo.

## Gatilhos de revisão

Revisar SLO/SLA quando ocorrer:

- Mudança arquitetural relevante.
- Três violações consecutivas de SLO no mesmo serviço.
- Alteração de tráfego/carga acima de 30%.

## Governança

- Toda revisão de meta deve atualizar `ROADMAP.md` e `CHANGELOG.md`.
- Mudança estrutural na estratégia de medição deve gerar ADR.
