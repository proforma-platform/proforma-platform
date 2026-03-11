# Runbook: Política de Classificação de Dados por Domínio de Negócio

## Objetivo

Estabelecer classificação de dados para orientar coleta, armazenamento,
compartilhamento e retenção nos serviços da plataforma.

## Escopo

- `web-public`
- `web-portal`
- `docs`
- Fluxos operacionais de suporte, incidentes e monitoramento

## Níveis de classificação

- **Público**: dados liberados para divulgação sem restrição.
- **Interno**: uso interno operacional, sem divulgação pública.
- **Restrito**: dados sensíveis de negócio, acesso controlado por necessidade.
- **Crítico**: dados altamente sensíveis (segurança/compliance), acesso estritamente limitado.

## Domínios e exemplos

### Institucional (web-public)

- Conteúdo de site, páginas de produto, materiais de marca.
- Classificação padrão: **Público**.

### Operacional (portal)

- Tickets, manifestações, histórico de atendimento.
- Classificação padrão: **Interno** ou **Restrito** (conforme conteúdo).

### Segurança e incidentes

- Logs de segurança, evidências de incidente, contexto técnico.
- Classificação padrão: **Restrito** / **Crítico**.

### Documentação técnica

- ADRs, roadmap, runbooks.
- Classificação padrão: **Interno** (alguns itens podem ser Públicos).

## Controles mínimos por classe

- **Público**: revisão editorial e integridade de conteúdo.
- **Interno**: acesso por função e rastreabilidade básica.
- **Restrito**: minimização de dados, mascaramento/anonimização quando aplicável.
- **Crítico**: acesso mínimo, revisão de segurança e retenção controlada.

## Regras de manuseio

1. Classificar dados na origem sempre que possível.
2. Não expor dados Restritos/Críticos em logs sem anonimização.
3. Compartilhamento externo requer minimização de dados.
4. Mudança de classificação deve ser registrada e justificada.

## Governança

- Revisão trimestral da matriz de classificação.
- Ajustes devem atualizar roadmap e changelog.
- Mudança estrutural de política exige ADR.
