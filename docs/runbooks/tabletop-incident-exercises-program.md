# Runbook: Programa de Exercícios Tabletop de Resposta a Incidentes

## Objetivo

Instituir rotina de exercícios tabletop para validar preparo de resposta a incidentes,
coordenação entre áreas e qualidade de decisão em cenários críticos.

## Escopo

- Canais web críticos (`web-public`, `web-portal`, `docs`, `status`)
- Fluxo de incident response e comunicação operacional
- Continuidade de negócio em modo degradado/contingência

## Cadência

- Exercício tabletop leve: mensal
- Exercício ampliado (multidomínio): trimestral

## Papéis do exercício

- Facilitador: conduz roteiro e controla tempo.
- Incident Commander simulado: coordena resposta.
- Engenharia: propõe e valida ações técnicas.
- Segurança: avalia risco e impacto.
- Comunicação: redige updates e encerramento.

## Estrutura de sessão (60-90 min)

1. Briefing do cenário e regras
2. Simulação por etapas (injects)
3. Decisões-chave e justificativas
4. Encerramento e lições aprendidas

## Cenários mínimos

- Falha de roteamento/edge
- Incidente de segurança em portal
- Degradação de disponibilidade acima do SLO
- Indisponibilidade de componente crítico de infraestrutura

## Métricas do programa

- Tempo até primeira decisão estruturada
- Tempo até comunicação inicial
- Aderência ao runbook (percentual)
- Quantidade de gaps identificados por exercício

## Saídas obrigatórias

- Relatório curto com decisões, acertos e falhas
- Lista de ações corretivas com owner e prazo
- Atualização de roadmap/changelog quando aplicável

## Governança

- Gaps críticos entram no roadmap como prioridade.
- Mudanças estruturais no programa exigem ADR.
- Evidências devem ser armazenadas conforme política de logs/dados.
