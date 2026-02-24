import type { Product } from "./types";

export const proformafarmProduct: Product = {
  slug: "proformafarm",
  name: "ProformaFarm",
  tagline: "ERP farmacêutico com controle operacional real e base preparada para escalar.",
  description:
    "O ProformaFarm combina operação, governança e rastreabilidade para farmácias, redes e distribuidores com foco em crescimento sustentável.",
  ogImage: "/brand/mark.svg",
  seo: {
    title: "ProformaFarm",
    description:
      "ERP farmacêutico para padronizar operação, reduzir risco fiscal e escalar com governança.",
  },
  features: [
    {
      title: "Rastreabilidade de ponta a ponta",
      description: "Controle de lote, validade e movimentação com histórico auditável.",
    },
    {
      title: "Governança fiscal",
      description: "Fluxos tributários estruturados para reduzir inconsistência operacional.",
    },
    {
      title: "Operação consolidada",
      description: "Visão unificada de compras, estoque e comercial em uma base única.",
    },
    {
      title: "Escala multiunidade",
      description: "Padronização de processos para expansão com previsibilidade.",
    },
  ],
  modules: [
    {
      title: "Operação farmacêutica",
      description: "Ciclo operacional com regras de negócio por contexto de uso.",
    },
    {
      title: "Fiscal e tributário",
      description: "Estrutura de conformidade para cenários fiscais de maior complexidade.",
    },
    {
      title: "Estoque e compras",
      description: "Planejamento e reposição com rastreabilidade de itens críticos.",
    },
  ],
  ctas: [
    { label: "Solicitar contato comercial", href: "/contato", kind: "primary" },
    { label: "Ver documentação e roadmap", href: "https://docs.proforma.net.br/", kind: "secondary" },
  ],
};
