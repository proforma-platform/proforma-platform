# Runbook: Política de Continuidade de Negócio para Canais Web Críticos

## Objetivo

Definir diretrizes para manter operação dos canais web críticos durante incidentes,
com foco em disponibilidade mínima, comunicação coordenada e retomada segura.

## Canais críticos

- `proforma.net.br` (web-public)
- `portal.proforma.net.br` (web-portal)
- `docs.proforma.net.br` (docs)
- `status.proforma.net.br` (status)

## Princípios de continuidade

- Priorizar restauração do serviço essencial antes de otimizações.
- Operar em modo degradado quando necessário para reduzir indisponibilidade.
- Preservar segurança e integridade de dados durante contingência.
- Registrar decisões e ações para auditoria posterior.

## Objetivos operacionais

- Restauração de canal crítico com impacto alto: até 60 minutos (meta inicial).
- Comunicação inicial de incidente crítico: até 30 minutos.
- Atualizações periódicas: conforme severidade definida no runbook de incidentes.

## Modos de operação

### Normal

- Serviços com capacidade esperada e monitoramento rotineiro.

### Degradado

- Redução temporária de funcionalidades não essenciais.
- Priorização de rotas críticas e páginas institucionais essenciais.

### Contingência

- Ações de fallback operacional definidas nos runbooks técnicos.
- Escalonamento completo do time de resposta.

## Papéis mínimos

- **BCP Owner**: coordena continuidade e priorização de recuperação.
- **Engineering Owner**: executa ações técnicas de restauração.
- **Comms Owner**: conduz comunicação interna/externa.

## Fluxo de ativação

1. Declarar incidente e severidade.
2. Identificar canais afetados e impacto de negócio.
3. Definir modo (degradado/contingência).
4. Executar plano de restauração priorizado.
5. Comunicar status e ETA.
6. Encerrar incidente com lições aprendidas.

## Critérios de retorno à normalidade

- Serviços críticos estáveis por janela mínima acordada.
- Indicadores de erro/latência dentro dos limites de SLO.
- Comunicação final emitida e registro completo do incidente.

## Governança

- Revisão semestral da política de continuidade.
- Mudança estrutural de estratégia exige ADR.
- Ações corretivas entram no roadmap antes de execução.
