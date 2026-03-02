# Runbook: Estratégia de Testes Sintéticos para SLO em Produção

## Objetivo

Definir estratégia de testes sintéticos para validar SLOs de disponibilidade e latência
em produção, sem alterar arquitetura nesta fase.

## Escopo

- `web-public` (`proforma.net.br`)
- `web-portal` (`portal.proforma.net.br`)
- `docs` (`docs.proforma.net.br`)

## Princípios

- Testes ativos, simples e previsíveis.
- Sem acesso a dados sensíveis.
- Sem impacto perceptível para usuários finais.
- Evidências registradas para revisão mensal de SLO/SLA.

## Cenários sintéticos mínimos

### Disponibilidade

- `HEAD /` para cada host principal.
- Critério de sucesso: status 2xx/3xx.
- Frequência inicial: a cada 1 minuto.

### Latência

- Medir tempo total da requisição HTTP.
- Coletar p50/p95 por janela de 5 minutos.
- Limites iniciais alinhados ao runbook de SLO/SLA.

### Roteamento e TLS

- Validar handshake TLS e host header esperado.
- Alertar em erro de certificado, timeout ou resposta inválida.

## Estratégia operacional

1. Executar probes de múltiplos pontos (quando disponível).
2. Agregar resultados por serviço e janela temporal.
3. Calcular consumo de error budget mensal.
4. Abrir item de correção no roadmap ao violar SLO de forma recorrente.

## Critérios de alerta inicial

- 3 falhas consecutivas de disponibilidade por serviço.
- p95 acima do limite por 3 janelas consecutivas.
- erro TLS recorrente por mais de 10 minutos.

## Governança

- Mudança de limiares deve refletir em `docs/runbooks/slo-sla-baseline.md`.
- Alteração de arquitetura de observabilidade requer ADR.
- Toda ação corretiva relevante deve atualizar roadmap e changelog.

## Fora de escopo nesta fase

- Provisionamento real de stack de monitoramento.
- Alertas paging automáticos.
- Dashboards gerenciados em produção.
