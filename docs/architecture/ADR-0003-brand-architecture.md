# ADR-0003: Brand Architecture Proforma (Branded House)

- Data: 2026-02-24
- Status: Accepted

## Contexto

A plataforma possui múltiplos produtos (ProformaFarm, MedCore e futuros SaaS) e
precisa de uma identidade visual consistente para comunicação institucional,
produto e documentação.

## Decisão

Adotar arquitetura de marca **Branded House**:

- Marca institucional dominante: **Proforma**
- Assinatura formal: **Proforma Platform**
- Submarcas: **ProformaFarm** e **MedCore**
- Símbolo único: **"P"** com cortes arquiteturais sutis, sem elementos figurativos

Regras de uso:

- Usar `Proforma` em interfaces, navegação e comunicação principal.
- Usar `Proforma Platform` em contextos formais (documentos, rodapés institucionais,
  materiais corporativos).
- Submarcas usam a mesma família visual, com variação de cor de accent.

Accent por marca:

- Proforma (marca-mãe): azul `#2563EB`
- ProformaFarm: azul forte `#1D4ED8`
- MedCore: teal `#0EA5A4`

## Consequências

- Consistência visual entre apps, docs e materiais institucionais.
- Menor fragmentação de identidade entre produtos.
- Necessidade de governança contínua dos tokens e guidelines.

## Governança

- Tokens oficiais em `packages/brand`.
- Diretrizes visuais em `docs/brand/visual-guidelines.md`.
- Mudanças estruturais de marca exigem nova ADR.
