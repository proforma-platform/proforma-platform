# Runbook: Plano de Testes de Recuperação de Desastre (Stack Web)

## Objetivo

Definir um plano prático de testes de recuperação de desastre para os serviços web,
com foco em continuidade operacional sem executar recuperação real nesta fase.

## Escopo

- `web-public`
- `web-portal`
- `docs`
- `traefik`
- artefatos de configuração e runbooks

## Premissas

- Ambiente principal em Ubuntu com Docker + Traefik.
- Build do monorepo como pré-condição de consistência.
- Estratégia sem destruição de produção nesta fase.

## Metas iniciais

- RTO alvo (serviços web): até 60 minutos
- RPO alvo (configuração e conteúdo estático): até 24 horas

## Cenários de teste

1. **Falha de container de app**
   - Simular indisponibilidade de `web-public`, `web-portal` ou `docs`.
   - Validar recuperação por rebuild/restart controlado.

2. **Falha do proxy reverso**
   - Simular indisponibilidade do `traefik`.
   - Validar retorno de roteamento HTTPS.

3. **Perda de configuração local**
   - Simular restauração de arquivos de compose/runbooks/tokens a partir de repositório.

4. **Falha parcial de DNS/edge**
   - Validar diagnóstico e mitigação por fallback operacional documentado.

## Procedimento de teste (staging)

1. Confirmar baseline:
   - `npm run build`
   - `docker compose ... config`
2. Executar cenário controlado em ambiente de teste.
3. Medir tempos reais de recuperação (RTO observado).
4. Registrar desvios vs. metas e lições aprendidas.
5. Abrir itens corretivos no roadmap quando necessário.

## Evidências obrigatórias

- Data/hora do teste
- Cenário executado
- Tempo de detecção
- Tempo de recuperação
- Resultado final (pass/fail)
- Ações corretivas propostas

## Critérios de aprovação

- Todos os cenários críticos executados com evidência registrada.
- RTO observado dentro de tolerância acordada.
- Plano de ação definido para gaps identificados.

## Governança

- Revisão semestral do plano de DR.
- Mudança estrutural de estratégia de recuperação exige ADR.
- Resultados relevantes atualizam roadmap e changelog.
