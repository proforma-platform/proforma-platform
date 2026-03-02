# @proforma/design-system

Core do Design System da Proforma Platform.

## Objetivo

Fornecer fundação única de tokens semânticos, contratos de componentes e tipagem para uso no `web-public`, `web-portal`, `docs` e produtos futuros.

## Conteúdo

- `tokens.css`: tokens de fundação (tipografia, espaçamento, borda, foco, sombras)
- `semantic.css`: classes utilitárias mínimas para componentes de base
- `src/theme.ts`: tema tipado para uso em TypeScript
- `src/types.ts`: tipos de tokens e contratos
- `src/contracts.ts`: contratos mínimos de componentes críticos
- `src/components/`: componentes base (`Typography`, `Button`, `Card`, `Container`)

## Como usar em CSS

```css
@import "@proforma/design-system/tokens.css";
@import "@proforma/design-system/semantic.css";
```

## Como usar em TypeScript

```ts
import { designSystemTheme } from "@proforma/design-system/theme";
import { componentContracts } from "@proforma/design-system/contracts";
```

## Governança

- `@proforma/brand` continua sendo a fonte canônica de identidade (cores institucionais e assets).
- `@proforma/design-system` define tokens semânticos e contratos de UI para escala de produto.
- Alterações estruturais devem atualizar `docs/DESIGN_SYSTEM_VISION.md`, `ROADMAP.md` e `CHANGELOG.md`.
