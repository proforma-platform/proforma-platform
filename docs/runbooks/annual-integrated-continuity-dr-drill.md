# Runbook: Simulação Anual Integrada de Continuidade e Recuperação (DR Drill)

## Objetivo

Executar um exercício anual integrado para validar continuidade de negócio e
recuperação técnica dos canais web críticos, com evidências auditáveis e plano
formal de melhorias.

## Escopo

- Serviços: `web-public`, `web-portal`, `docs`, `status`, `traefik`, `n8n`
- Processos: incident response, comunicação externa de crise e continuidade
- Limite: ambiente controlado de simulação, sem deploy produtivo automático

## Pré-requisitos

- Runbooks base atualizados (`incident response`, `BCP`, `DR tests`)
- Lista de contatos e papéis validada
- Janela aprovada para exercício sem impacto em produção real
- Critérios de sucesso e falha aprovados antes da execução

## Papéis

- Exercise Director: responsável pelo roteiro e aceite final.
- Incident Commander: coordena decisões operacionais durante o drill.
- Tech Lead: conduz ações técnicas de mitigação e recuperação.
- Security Lead: valida riscos e controles durante o exercício.
- Communications Lead: executa protocolo de comunicação interna/externa.
- Scribe: registra timeline, decisões e evidências.

## Cenário integrado mínimo

1. Degradação severa de disponibilidade em canal principal.
2. Falha parcial de roteamento/reverse proxy.
3. Necessidade de ativar modo de continuidade (degradado).
4. Recuperação controlada com critérios de retorno ao estado normal.

## Etapas do drill

1. Kickoff e alinhamento de regras (15 min)
2. Execução de cenário e decisões por fase (60-90 min)
3. Comunicação de crise simulada e validação de mensagens (20 min)
4. Recuperação e retorno assistido (30-45 min)
5. Debrief final e plano de ações (30 min)

## Critérios de aceite

- RTO/RPO simulados avaliados contra metas vigentes.
- Primeira comunicação estruturada emitida no SLA interno.
- Decisões críticas registradas com owner e racional.
- Ações corretivas classificadas por prioridade e prazo.

## Evidências obrigatórias

- Timeline consolidada do exercício
- Log de decisões e responsáveis
- Templates de comunicação utilizados
- Relatório pós-drill com lições aprendidas

## Pós-execução

- Atualizar `ROADMAP.md` com gaps críticos identificados.
- Atualizar `CHANGELOG.md` se houver mudança de processo.
- Abrir ADR quando houver alteração arquitetural relevante.
- Revisar plano em até 30 dias com status das ações corretivas.

## Governança

- Este drill é obrigatório 1x por ano e recomendado em versão reduzida semestral.
- Não deve gerar conflito com ambientes de Postgres e n8n já existentes.
- Qualquer ajuste de escopo deve respeitar a fase atual do roadmap.
