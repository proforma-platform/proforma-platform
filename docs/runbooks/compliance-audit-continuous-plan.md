# Runbook: Plano de Auditoria Contínua de Compliance Técnico

## Objetivo

Estabelecer um processo recorrente de auditoria técnica para verificar aderência a
padrões de segurança, governança e operação definidos no monorepo.

## Escopo de auditoria

- Governança documental (`ROADMAP`, `CHANGELOG`, ADRs, runbooks)
- Segurança de aplicação (headers, segregação de superfície, práticas seguras)
- Operação e confiabilidade (SLO/SLA, incidentes, comunicação)
- Infra e isolamento (Docker, Traefik, exposição de portas)

## Cadência

- Auditoria leve: semanal
- Auditoria completa: mensal
- Revisão executiva de conformidade: trimestral

## Checklist mínimo mensal

1. Confirmar que tarefas executadas constam no roadmap.
2. Validar atualização de changelog e ADR quando aplicável.
3. Revisar headers e práticas de segurança em apps web.
4. Revisar aderência aos runbooks de incident response e comunicação.
5. Verificar baseline SLO/SLA e consumo de error budget.
6. Verificar política de logs (retenção, anonimização, expurgo).
7. Registrar não conformidades e plano de correção com prazo.

## Evidências exigidas

- Saída de build (`npm run build`) em estado saudável.
- Referências de arquivos atualizados em cada entrega.
- Registro de incidentes e ações corretivas.
- Registro de revisão do scorecard de arquitetura e segurança.

## Classificação de não conformidade

- **NC-1 Crítica**: risco alto imediato (segurança/produção).
- **NC-2 Relevante**: lacuna com impacto potencial médio.
- **NC-3 Melhoria**: ajuste recomendado sem risco imediato.

## Tratamento

- NC-1: abrir item imediato no roadmap e iniciar contenção.
- NC-2: entrar na fila prioritária com prazo definido.
- NC-3: backlog futuro com revisão periódica.

## Governança

- Toda auditoria gera relatório curto com status por domínio.
- Mudanças de critério de auditoria exigem atualização deste runbook.
- Alteração estrutural de compliance técnico exige ADR.
