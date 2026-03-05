# GOVHUB UDN V2 - Evolucao de Compactacao

## Objetivo
Diminuir consumo de tokens por missao sem perder governanca, auditoria ou compatibilidade CCP.

## Problema observado (V1)
- prompt com texto livre antes do bloco UDN
- repeticao de campos fixos em toda missao (`#σ`, `!OUT`, `#af`, `|PLAN|REGISTRAR`)
- inconsistencias de `mission_id` dentro do `!MIS`

## Padrao V2 (cliente)
Formato minimo recomendado:

```txt
!MIS|00017
#μ:<objetivo compacto>
#τ:<tarefas compactas>
```

## Enriquecimento server-side (register)
O backend completa automaticamente:
- `#σ:READY`
- `!OUT:JSON_ONLY.NO_MD.NO_TXT.`
- `#af:enabled=true;max_rounds=2;on_exhaust=pause_owner` (ou override por `autofix_control`)

Tambem aplica:
- canonicalizacao (remove texto antes de `!MIS`)
- validacao de consistencia entre token de `!MIS` e `mission.id`
- fail-closed em ambiguidade

## Compatibilidade
- V1 continua aceito
- V2 e recomendado para novas missoes
- envelope CCP permanece obrigatorio

## Comparativo de consumo (referencia real)
Base real usada: `GOV-MANAGER-V1-00002 = 862 tokens`.

- V1 compacto: `634` tokens (aprox. `-26,5%`)
- V2 enxuto: `490` tokens (aprox. `-43,2%`)

## Estado da evolucao
- backend register: V2 aplicado
- app gov-manager: gerador padrao migrado para V2 compacto
- documentacao de contrato e token-ops atualizada
