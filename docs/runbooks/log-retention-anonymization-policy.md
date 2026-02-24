# Runbook: Política de Retenção e Anonimização de Logs Operacionais

## Objetivo

Definir regras de retenção, minimização e anonimização de logs para serviços web,
com foco em segurança, rastreabilidade e conformidade operacional.

## Escopo

- Logs de aplicação (`web-public`, `web-portal`, `docs`)
- Logs de proxy/rede (Traefik)
- Logs de operação e monitoramento

## Princípios

- Coletar somente dados necessários ao diagnóstico.
- Não registrar segredos, tokens, senhas ou payloads sensíveis.
- Aplicar retenção por classe de log.
- Anonimizar dados pessoais quando não forem essenciais.

## Classes e retenção inicial

- **Operacional padrão** (acesso, health, status): 30 dias
- **Diagnóstico técnico** (erros, stack traces): 60 dias
- **Incidentes de segurança** (eventos SEV): 180 dias

## Regras de anonimização

- Endereços IP em logs de aplicação: mascarar último octeto (`192.168.1.xxx`) quando possível.
- Identificadores de usuário: preferir hash/token interno não reversível.
- Campos livres de texto: aplicar sanitização e truncamento.
- Nunca persistir credenciais, cookies de sessão ou authorization headers.

## Controle de acesso

- Acesso a logs restrito por necessidade operacional.
- Auditoria de acesso aos repositórios de logs quando disponível.
- Compartilhamento externo apenas com dados minimizados.

## Processo de expurgo

1. Definir janela de retenção por classe.
2. Aplicar expurgo automático por política de TTL quando disponível.
3. Validar mensalmente se o expurgo foi aplicado.
4. Registrar exceções temporárias com justificativa e prazo.

## Governança

- Mudança de retenção/anonimização deve atualizar este runbook e o roadmap.
- Incidentes com exposição de dados exigem revisão imediata da política.
- Decisão estrutural de observabilidade/logging deve gerar ADR.

## Fora de escopo nesta fase

- Implantação de plataforma centralizada de logs.
- Criptografia avançada de pipeline além da infraestrutura já existente.
