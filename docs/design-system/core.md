# Design System Core

O `@proforma/design-system` centraliza a fundação de interface da plataforma.

## Escopo

- Tokens semânticos reutilizáveis
- Contratos tipados de componentes críticos
- Base para consistência visual e acessibilidade entre apps

## Relação com Brand

- `@proforma/brand`: identidade visual (marca, assets, cores institucionais)
- `@proforma/design-system`: sistema de interface (semântica, escala, contratos)

## Regras de uso

1. Aplicações devem importar tokens via pacote (`@proforma/design-system/tokens.css`).
2. Não duplicar tokens em arquivos locais de app.
3. Componentes compartilhados devem seguir contratos em `src/contracts.ts`.
4. Qualquer mudança estrutural deve atualizar roadmap, changelog e docs de visão.

## Acessibilidade mínima

- Foco visível em elementos interativos
- Navegação por teclado
- Labels e atributos ARIA obrigatórios conforme contrato
