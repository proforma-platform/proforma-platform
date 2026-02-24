# Proforma Platform: Global Benchmark & Strategic Evolution

## 1. Visão Geral (The Portal Concept)
A missão é transicionar a **Proforma** de um site institucional para um **Portal de Ecossistema SaaS B2B**. A plataforma deve ser percebida como a infraestrutura crítica que sustenta a operação de indústrias farmacêuticas e unidades de saúde, unificando o **ProformaFarm (ERP)** e o **MedCore (Clínico)** sob uma arquitetura de marca coesa e global.

### Pilares Estratégicos
* **Trust-First:** Segurança e conformidade regulatória (ANVISA/LGPD) como base.
* **Scalability:** Design que suporta desde pequenas clínicas até grandes distribuidoras.
* **Developer-Friendly:** Documentação técnica acessível e APIs robustas (padrão Stripe).

---

## 2. Arquitetura de Informação (IA)

Inspirado no modelo da **Atlassian** e **Microsoft Dynamics 365**, o portal será organizado em três camadas de navegação:

### A. Camada de Plataforma (proforma.net.br)
* **Hero:** Proposta de valor unificada (Saúde + Tecnologia).
* **Product Switcher:** Cards interativos para seleção de vertical (Farmacêutica vs. Clínica).
* **Shared Services:** Seções de Segurança, Nuvem e Integrações que atendem a ambos os produtos.

### B. Vertical ProformaFarm (ERP)
* **Foco:** Supply Chain, Rastreabilidade e Financeiro.
* **Narrativa:** "Controle total da cadeia de suprimentos farmacêutica".
* **Key Features:** Gestão de Lotes, SNGPC, Entrada de Notas e Business Intelligence.

### C. Vertical MedCore (Hospitalar/Odonto)
* **Foco:** Jornada do Paciente e Gestão de Desfecho.
* **Narrativa:** "Excelência clínica com eficiência operacional".
* **Key Features:** Prontuário Eletrônico, Agendamento Inteligente e Faturamento TISS/TUSS.

---

## 3. Diretrizes de Design & UX (Design System)

Com base no benchmark do **Figma** e **Linear**, o padrão visual recomendado é o **Enterprise Minimalist**:

| Elemento | Especificação Técnica | Inspiração |
| :--- | :--- | :--- |
| **Tipografia** | Inter ou Geist Sans (Geométrica e legível) | Vercel / Figma |
| **Paleta Principal** | Dark Navy (`#0F172A`) e Pure White (`#FFFFFF`) | Stripe |
| **Cores de Destaque** | ProformaFarm (Verde) / MedCore (Azul) | HubSpot |
| **Raio de Borda** | `6px` a `8px` (Moderno e Sério) | Linear |
| **Componentes** | Uso de **Bento Grids** para destaques | Apple / Stripe |

---

## 4. Diferenciais Técnicos (Baseado nos Repositórios)

Extraídos da análise de código e documentação técnica atual:

1.  **Compliance Nativo:** Automação de processos regulatórios brasileiros (ANVISA), reduzindo o erro humano em 90%.
2.  **Arquitetura Cloud-Native:** Disponibilidade e redundância para operações 24/7.
3.  **Modularidade:** Capacidade de ativar ou desativar módulos conforme a necessidade do cliente (estilo HubSpot).
4.  **Interoperabilidade:** Prontidão para integração com APIs de terceiros e ecossistemas de saúde governamentais.

---

## 5. Estratégia de Copywriting (Tom de Voz)

Inspirado em **Stripe** e **Veeva**:
* **Tonalidade:** Autoridade técnica, mas acessível.
* **Foco no Benefício:** Em vez de "Temos módulo de estoque", use "Reduza perdas por validade com rastreabilidade inteligente".
* **Palavras-Chave:** *Infraestrutura, Precisão, Conformidade, Eficiência Operacional, Escalabilidade.*

---

## 6. Status de Implementação do Core

- Workspace oficial: `packages/design-system` (`@proforma/design-system`)
- Fundamentos entregues:
  - `tokens.css` (tipografia, espaçamento, superfícies, foco e sombras)
  - `semantic.css` (classes base)
  - `src/theme.ts` (tema tipado)
  - `src/contracts.ts` e `src/types.ts` (contratos e tipos)
- Governança:
  - ADR: `docs/architecture/ADR-0006-design-system-core.md`
  - Guia operacional: `docs/design-system/core.md`
