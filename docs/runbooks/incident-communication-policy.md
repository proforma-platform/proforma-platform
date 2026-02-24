# Runbook: Política de Comunicação de Incidentes

## Objetivo

Padronizar comunicação durante incidentes para reduzir ruído, garantir alinhamento
com stakeholders e preservar rastreabilidade.

## Princípios

- Uma fonte oficial de status por incidente.
- Mensagens curtas, objetivas e com horário.
- Sem exposição de segredos ou dados sensíveis.
- Ritmo de atualização previsível por severidade.

## Canais

- **Interno técnico**: canal operacional do time.
- **Interno executivo**: resumo para liderança.
- **Externo (quando aplicável)**: status page/comunicado institucional.

## Cadência de atualização

- **SEV-1**: atualização a cada 30 minutos.
- **SEV-2**: atualização a cada 60 minutos.
- **SEV-3**: atualização em marcos de progresso.

## Template de comunicado inicial

- Incidente: `<id/título>`
- Severidade: `<SEV>`
- Início: `<data-hora>`
- Serviços afetados: `<lista>`
- Impacto observado: `<resumo>`
- Próxima atualização: `<data-hora>`

## Template de atualização

- Status atual: `<investigando|mitigando|monitorando|resolvido>`
- Ação executada: `<resumo>`
- Impacto atual: `<resumo>`
- Próxima atualização: `<data-hora>`

## Template de encerramento

- Encerramento: `<data-hora>`
- Causa raiz (resumo): `<texto>`
- Ações corretivas imediatas: `<lista>`
- Ações preventivas: `<lista>`
- Link do postmortem: `<referência>`

## Governança

- Toda comunicação deve referenciar o registro do incidente.
- Postmortem obrigatório para SEV-1 e SEV-2.
- Itens de melhoria entram no roadmap antes de execução.
