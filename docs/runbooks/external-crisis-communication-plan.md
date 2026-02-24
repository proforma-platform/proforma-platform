# Runbook: Plano de Comunicação Externa de Crise para Canais Web

## Objetivo

Definir estratégia e protocolo de comunicação externa durante incidentes críticos
nos canais web da Proforma Platform.

## Escopo

- `proforma.net.br`
- `portal.proforma.net.br`
- `docs.proforma.net.br`
- `status.proforma.net.br`

## Princípios

- Transparência com precisão técnica.
- Comunicação rápida sem divulgar dados sensíveis.
- Mensagens consistentes entre canais oficiais.
- Atualizações periódicas com horário e status.

## Gatilhos de ativação

Ativar comunicação externa quando houver:

- indisponibilidade crítica de canal público;
- degradação prolongada com impacto relevante em clientes;
- incidente de segurança com impacto externo confirmado.

## Papéis mínimos

- **Comms Lead**: responsável pela mensagem externa.
- **Incident Commander**: valida status técnico.
- **Security Owner**: valida risco e limite de divulgação.
- **Aprovação executiva**: para incidentes SEV-1/SEV-2 com impacto externo.

## Canais de comunicação

- Página de status (`status.proforma.net.br`)
- Comunicado institucional (canal oficial)
- Atualização para clientes impactados (quando aplicável)

## Templates

### Comunicado inicial

- Incidente: `<título>`
- Início: `<data-hora>`
- Serviços afetados: `<lista>`
- Impacto: `<resumo objetivo>`
- Próxima atualização: `<data-hora>`

### Atualização de progresso

- Status: `<investigando | mitigando | monitorando>`
- Ação em andamento: `<resumo>`
- Impacto atual: `<resumo>`
- Próxima atualização: `<data-hora>`

### Encerramento

- Encerramento: `<data-hora>`
- Causa raiz (resumo): `<texto>`
- Ações corretivas: `<lista>`
- Ações preventivas: `<lista>`

## Cadência recomendada

- SEV-1: atualização a cada 30 minutos
- SEV-2: atualização a cada 60 minutos
- SEV-3: atualização por marcos

## Governança

- Toda comunicação deve vincular incidente interno.
- Postmortem obrigatório para incidentes com comunicação externa.
- Ajustes estruturais desta política exigem ADR.
