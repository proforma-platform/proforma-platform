# Proforma Platform — Project Context Snapshot
**Data:** 2026-02-24  
**Status:** Active Development  
**Governança:** Staff-supervised / AI-assisted execution  

---

# 1. Estratégia Institucional

## 1.1 Arquitetura de Marca

Modelo: **Branded House (marca-mãe dominante)**

- Marca institucional: **Proforma**
- Assinatura formal: **Proforma Platform**
- Submarcas:
  - ProformaFarm
  - MedCore
  - Futuras soluções SaaS

## 1.2 Regras de Uso

- Interfaces e navegação: **Proforma**
- Documentos institucionais: **Proforma Platform**
- Submarcas usam mesma estrutura visual com variação de accent

## 1.3 Sistema de Cor (Oficial)

Marca-mãe:
- Accent: `#2563EB`
- Navy base: `#0F172A`

Submarcas:
- ProformaFarm: `#1D4ED8`
- MedCore: `#0EA5A4`

Tokens centralizados em:
`packages/brand/`

---

# 2. Arquitetura Técnica

## 2.1 Modelo Geral

Monorepo:
- npm workspaces
- Turbo
- Commit incremental disciplinado

Estrutura:

apps/
  web-public      (Astro)
  web-portal      (Next.js 16)
docs/
  docusaurus
packages/
  brand
infra/
  docker
  traefik

Backend ERP (separado):
- .NET 8
- Modular Monolith
- Clean Architecture
- EF Core (write)
- Dapper (read)
- OrgContext obrigatório
- Auditoria estruturada
- Outbox Pattern em consolidação

---

# 3. Infraestrutura

Ambiente principal:

- Ubuntu Server
- Docker
- Postgres
- n8n (público)
- Cloudflare DNS
- Traefik/Nginx

Regras:
- Não alterar infra sem justificativa arquitetural
- Sem adicionar dependências desnecessárias
- Build sempre deve passar

---

# 4. Brand System

Fonte oficial:
`packages/brand`

Contém:
- SVG oficiais
- tokens.css
- colors.ts
- README
- ADR-0003

Regras:
- Não alterar marca sem nova ADR
- Não usar cores fora dos tokens
- Sem gradientes ou efeitos decorativos no símbolo
- Lockup empilhado para uso formal

---

# 5. Governança Operacional com IA

Regras globais:

- Não solicitar confirmação para alterações internas ao repo
- Solicitar confirmação apenas para:
  - Firewall
  - DNS
  - Segredos
  - Deploy real
  - Force push
  - Alterações fora do repositório

- Commit único por incremento
- Sem reformatar estrutura base
- Sem alterar Docker/CI sem aprovação explícita

---

# 6. Estado Atual (Marcos Concluídos)

- Brand system formalizado
- ADR-0003 aprovado
- Tokens alinhados
- Identidade aplicada no Docusaurus
- Monorepo estável
- Build Turbo passando
- Apps Astro e Next estruturados
- Estrutura de páginas institucionais criada

---

# 7. Roadmap Imediato (Próximos Incrementos)

## Fase 1 — Consolidação Institucional

1. Aplicar marca completa no web-public e web-portal
2. Criar Hero institucional principal
3. Criar página institucional “Sobre a Plataforma”
4. Refinar páginas Produto:
   - ProformaFarm
   - MedCore
5. Criar banners OpenGraph 1200x630
6. Implementar HelpLauncher global

---

## Fase 2 — Estrutura Comercial

1. Página Central de Vendas
2. Área de Cliente (placeholder auth)
3. Página Segurança detalhada
4. Página Compliance e Governança

---

## Fase 3 — Integração Plataforma

1. Integração visual com Portal
2. SSO planejado
3. Integração futura com ERP
4. Integração n8n documentada

---

# 8. Padrão para Novos Chats

Sempre iniciar com:

Estamos continuando o projeto Proforma Platform.
Use como contexto oficial:
docs/context/PROJECT-CONTEXT-2026-02.md

Considere decisões consolidadas.
Foco no próximo incremento.
Não reanalisar histórico.

---

# 9. Política de Contexto

Este documento substitui histórico de conversa.

Qualquer decisão estrutural nova:
- Deve gerar nova ADR
- Deve atualizar este snapshot

---

# 10. Próxima Ação Recomendada

Próximo incremento técnico sugerido:

feat(web-public): implement institutional hero and brand header

Objetivo:
- Hero institucional forte
- Watermark do símbolo
- CTA para produtos
- Estrutura pronta para escalar
