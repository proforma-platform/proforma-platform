Implementação da missão `GOV-0060-V0.6.0-ENTERPRISE-LAYER` concluída na branch `feat/v0.6.0-enterprise-credibility`.

**Commit**
- `e6b1364` (já publicado em `origin/feat/v0.6.0-enterprise-credibility`)

**PR**
- Não consegui criar PR automático porque `gh` não está instalado no ambiente (`gh: command not found`).
- Link direto para abrir o PR:  
  `https://github.com/proforma-platform/proforma-platform/pull/new/feat/v0.6.0-enterprise-credibility`

**Arquivos criados/alterados**
- [ProductPageTemplate.astro](/opt/proforma/proforma-platform/apps/web-public/src/components/ProductPageTemplate.astro)
- [FooterPattern.astro](/opt/proforma/proforma-platform/apps/web-public/src/components/patterns/FooterPattern.astro)
- [ProductHeroPattern.astro](/opt/proforma/proforma-platform/apps/web-public/src/components/patterns/ProductHeroPattern.astro)
- [ProductHighlightsPattern.astro](/opt/proforma/proforma-platform/apps/web-public/src/components/patterns/ProductHighlightsPattern.astro)
- [SocialProofPattern.astro](/opt/proforma/proforma-platform/apps/web-public/src/components/patterns/SocialProofPattern.astro)
- [TrustCompliancePattern.astro](/opt/proforma/proforma-platform/apps/web-public/src/components/patterns/TrustCompliancePattern.astro)
- [BaseLayout.astro](/opt/proforma/proforma-platform/apps/web-public/src/layouts/BaseLayout.astro)
- [index.astro](/opt/proforma/proforma-platform/apps/web-public/src/pages/index.astro)
- [site.css](/opt/proforma/proforma-platform/apps/web-public/src/styles/site.css)

**Evidência de build**
- Comando: `npm -w apps/web-public run build`
- Resultado: build Astro concluído com sucesso, 10 páginas geradas.

**Descrição visual final**
- HOME recebeu:
  - seção de Social Proof com cards de depoimento/métrica
  - seção Trust & Compliance com pilares institucionais
  - footer institucional expandido (logo, colunas, legal)
- Páginas de produto receberam:
  - hero orientado a benefício por produto
  - highlights em cards
  - bloco “Dashboard Preview” 100% CSS (sem imagem pesada)
  - seção de confiança e CTA final
- Header agora mantém switcher de produto com estado ativo.
- Canonical/OG/JSON-LD permanecem consistentes com trailing slash para produtos.
 
(Aguardando revisão antes de merge em xxxx_xxxx)
"Nenhuma alteração foi feita em infra/, nginx/Cloudflare, docker-compose, PostgreSQL, n8n ou serviços conectados.
