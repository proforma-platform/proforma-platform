# Runbook: Matriz de Risco por Serviço e Domínio Funcional

## Objetivo

Mapear riscos técnicos e operacionais por serviço do monorepo e por domínio funcional,
com classificação de probabilidade/impacto e plano de tratamento.

## Escala de risco

- Probabilidade: 1 (baixa) a 5 (alta)
- Impacto: 1 (baixo) a 5 (alto)
- Nível = Probabilidade x Impacto

Faixas:

- 1-5: Baixo
- 6-12: Médio
- 13-25: Alto

## Domínios funcionais

- Disponibilidade
- Segurança
- Governança
- Operação
- Conformidade

## Matriz inicial

| Serviço | Domínio | Risco | Prob. | Impacto | Nível | Controles atuais | Ação recomendada |
|---|---|---|---:|---:|---:|---|---|
| web-public | Disponibilidade | regressão de build/deploy | 2 | 4 | 8 | CI + build monorepo | manter smoke checks por release |
| web-public | Segurança | header/CSP incompleto | 2 | 4 | 8 | headers no app + proxy | revisão trimestral de headers |
| web-portal | Segurança | futura auth mal integrada | 3 | 5 | 15 | ADR de SSO + escopo sem auth real | validar rollout por tenant antes de ativar |
| web-portal | Operação | quebra de rota crítica | 3 | 4 | 12 | build estático + revisão de rotas | incluir testes sintéticos de rota |
| docs | Governança | documentação desatualizada | 3 | 3 | 9 | roadmap/changelog obrigatórios | auditoria mensal de docs |
| infra/traefik | Segurança | exposição indevida de porta | 2 | 5 | 10 | somente 80/443 publicados | revisão mensal do compose |
| n8n | Segurança | acesso indevido ao painel | 3 | 5 | 15 | auth básica + recomendação Zero Trust | aplicar Access antes de produção final |
| observabilidade | Conformidade | retenção de logs inadequada | 3 | 4 | 12 | política de retenção publicada | validar expurgo mensalmente |

## Processo de revisão

1. Revisão mensal da matriz.
2. Atualizar probabilidade/impacto com base em incidentes e auditorias.
3. Abrir item no roadmap para riscos altos sem mitigação suficiente.
4. Registrar evolução no changelog quando houver mudança de controle.

## Governança

- Mudança metodológica na matriz exige ADR.
- Riscos de nível alto devem ter plano ativo com owner e prazo.
