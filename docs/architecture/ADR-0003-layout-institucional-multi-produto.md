# ADR-0003: Layout Institucional Multi-Produto

- Data: 2026-02-24
- Status: Accepted

## Contexto

A Proforma Platform representa múltiplos produtos (ProformaFarm ERP, MedCore e
futuras soluções SaaS) e precisa comunicar posicionamento institucional de forma
coesa, sem misturar responsabilidades com o portal do cliente.

## Decisão

Adotar layout institucional multi-produto no `apps/web-public` com estrutura de
navegação explícita por domínio de conteúdo:

- visão institucional (`/`)
- produtos (`/produtos`, `/produtos/proformafarm`, `/produtos/medcore`)
- confiança e transparência (`/seguranca`, `/arquitetura`, `/evolucao`)
- relacionamento (`/contato`)

A experiência de portal permanece isolada no `apps/web-portal` (`/portal/*`).

## Consequências

- Clareza de comunicação externa sem acoplamento com jornada operacional do cliente.
- Base consistente para crescimento do portfólio de produtos sem refatoração estrutural.
- Redução de risco de confusão entre superfície pública e área autenticada futura.
