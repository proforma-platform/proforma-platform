# Runbook: Security Incident Response

## Objetivo

Definir resposta operacional a incidentes de segurança para portal e serviços web,
com fluxo, papéis e critérios de escalonamento.

## Classificação de severidade

- **SEV-1 (Crítico)**: vazamento de dados sensíveis, comprometimento de credenciais,
  indisponibilidade total de serviço crítico, risco legal imediato.
- **SEV-2 (Alto)**: exposição indevida com potencial impacto relevante, degradação severa,
  comportamento explorável sem confirmação de exfiltração.
- **SEV-3 (Médio/Baixo)**: não conformidade sem impacto direto imediato, falhas mitigáveis.

## RACI mínimo

- **Incident Commander (IC)**: coordena resposta e decisão de prioridade.
- **Engineering Owner**: executa mitigação técnica e valida correções.
- **Security Owner**: avalia impacto e risco de segurança.
- **Comms Owner**: centraliza comunicação interna/externa.

## Fluxo de resposta

1. **Detectar e registrar**
   - Abrir registro com data/hora, serviço afetado, evidências e impacto.
2. **Classificar severidade**
   - Aplicar matriz SEV-1/SEV-2/SEV-3 e definir dono do incidente.
3. **Conter**
   - Mitigar impacto sem ações destrutivas não aprovadas.
4. **Analisar causa**
   - Identificar vetor, superfície e escopo.
5. **Corrigir e validar**
   - Aplicar patch e validar com build/testes necessários.
6. **Comunicar**
   - Seguir política de comunicação operacional.
7. **Postmortem**
   - Documentar causa raiz, ações corretivas e preventivas.

## SLA interno de resposta (baseline)

- SEV-1: início de resposta em até 15 minutos.
- SEV-2: início de resposta em até 30 minutos.
- SEV-3: início de resposta em até 4 horas úteis.

## Evidências mínimas

- Logs relevantes (sem exposição de segredos).
- Passos de reprodução.
- Impacto observado e potencial.
- Ação corretiva aplicada.

## Governança

- Toda correção crítica deve estar vinculada a item do `ROADMAP.md`.
- Toda decisão arquitetural decorrente de incidente deve gerar ADR.
- Atualizar `CHANGELOG.md` quando houver impacto de produto/operação.
