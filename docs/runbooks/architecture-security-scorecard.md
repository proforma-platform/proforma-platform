# Runbook: Scorecard de Arquitetura e Segurança por Fase

## Objetivo

Padronizar avaliação de maturidade técnica por fase do roadmap, com foco em
arquitetura e segurança.

## Escala de pontuação

- 0: não iniciado
- 1: iniciado sem padrão
- 2: parcial com lacunas relevantes
- 3: adequado para fase atual
- 4: maduro e consistente

Pontuação total = média ponderada dos critérios (0 a 4).

## Critérios e pesos

- Governança documental (`ROADMAP`, `CHANGELOG`, ADR): **20%**
- Segurança de aplicação (headers, superfície, sanitização): **20%**
- Segurança operacional (runbooks, incident response, comunicação): **20%**
- Arquitetura e isolamento de serviços: **20%**
- Confiabilidade operacional (SLO/SLA e evidências): **20%**

## Meta por fase

- Fase 1: >= 2.0
- Fase 2: >= 2.5
- Fase 3: >= 3.0
- Fase 4: >= 3.3
- Fase 5: >= 3.6

## Matriz de avaliação rápida

| Fase | Governança | AppSec | OpsSec | Arquitetura | Confiabilidade | Nota final |
|---|---:|---:|---:|---:|---:|---:|
| Fase 1 | 4 | 2 | 2 | 3 | 2 | 2.6 |
| Fase 2 | 4 | 3 | 2 | 3 | 2 | 2.8 |
| Fase 3 | 4 | 3 | 3 | 3 | 2 | 3.0 |
| Fase 4 | 4 | 3 | 3 | 3 | 3 | 3.2 |
| Fase 5 | 4 | 4 | 4 | 4 | 4 | 4.0 |

## Processo de revisão

1. Revisão ao final de cada fase relevante.
2. Registrar nota e justificativa no relatório operacional interno.
3. Abrir itens de melhoria no roadmap para critérios < meta da fase.
4. Atualizar changelog quando houver evolução de maturidade.

## Governança

- Mudança de pesos ou critérios exige ADR.
- Itens corretivos identificados no scorecard entram no roadmap antes de execução.
