# @proforma/brand

Pacote de tokens e ativos de marca para uso em apps e documentação.

## Conteúdo

- `tokens.css`: variáveis CSS oficiais da marca
- `colors.ts`: export TypeScript das cores
- `assets/`: placeholders de logo/mark em SVG

## Uso em CSS

```css
@import "@proforma/brand/tokens.css";

.hero {
  background: var(--pf-color-navy);
  color: var(--pf-color-surface);
}
```

## Uso em TypeScript

```ts
import { brandColors } from "@proforma/brand/colors";

const primary = brandColors.brand500;
```

## Placeholders de logo

- `assets/logo.svg`
- `assets/logo-white.svg`
- `assets/mark.svg`

Substituir pelos SVG finais aprovados no processo de branding.
