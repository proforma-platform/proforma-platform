# ADR-0006 — Design System Core Modular

## Status

Accepted

## Contexto

A plataforma Proforma evoluiu de páginas institucionais para uma arquitetura multi-produto (`web-public`, `web-portal`, `docs`) com necessidade de consistência visual e acessibilidade. O pacote `@proforma/brand` cobre identidade (cores e assets), mas não define contratos semânticos e tipados para evolução de componentes compartilhados.

## Decisão

Criar o workspace `@proforma/design-system` como núcleo do design system com:

- tokens semânticos (`tokens.css`) que estendem `@proforma/brand`
- classes utilitárias mínimas (`semantic.css`)
- tema tipado para TypeScript (`src/theme.ts`)
- contratos tipados para componentes críticos (`src/contracts.ts`, `src/types.ts`)

As aplicações devem importar tokens a partir de `@proforma/design-system/tokens.css`, evitando cópias locais.

## Consequências

- Consistência visual e de acessibilidade entre apps com menor drift.
- Evolução de componentes compartilhados passa a ter contratos explícitos e auditáveis.
- `@proforma/brand` permanece fonte canônica de identidade, enquanto `@proforma/design-system` concentra semântica de interface.
- Requer atualização coordenada de roadmap/changelog/docs a cada evolução estrutural do design system.
