# ADR-0005: Estratégia de Preview Environments por PR

- Data: 2026-02-24
- Status: Accepted

## Contexto

A evolução do portal e do site institucional exige validação rápida por PR sem
impactar produção, mas o projeto ainda está consolidando governança e hardening.

## Decisão

Adotar estratégia de preview environments efêmeros por PR como objetivo de
médio prazo, documentando o modelo operacional agora e postergando automação de
provisionamento para fase posterior.

## Consequências

- Melhora de qualidade de revisão antes de merge.
- Redução de risco de regressões visuais/funcionais em produção.
- Exige política robusta de isolamento de dados e limpeza automática antes da ativação.
