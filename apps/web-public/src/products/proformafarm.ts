import type { Product } from "./types";

export const proformafarmProduct: Product = {
  slug: "proformafarm",
  name: "ProformaFarm",
  tagline: "Rastreabilidade farmacêutica e eficiência operacional com conformidade contínua.",
  description:
    "ProformaFarm organiza ponta a ponta da operação farmacêutica com controle de validade, redução de ruptura e governança auditável para crescimento consistente.",
  ogImage: "/brand/mark.svg",
  seo: {
    title: "ProformaFarm",
    description:
      "ERP farmacêutico para padronizar operação, reduzir risco fiscal e escalar com governança.",
  },
  features: [
    {
      title: "Rastreabilidade e validade em tempo real",
      description: "Controle de lote e vencimento com trilha auditável para reduzir perdas e riscos regulatórios.",
    },
    {
      title: "Eficiência de estoque e operação",
      description: "Reposição orientada por dados para equilibrar giro, disponibilidade e custo operacional.",
    },
    {
      title: "Conformidade e auditoria contínuas",
      description: "Processos fiscais e operacionais padronizados para inspeções com menos retrabalho.",
    },
    {
      title: "Saúde financeira e margem",
      description: "Visibilidade de custos, preços e rentabilidade para decisões mais seguras por unidade.",
    },
  ],
  modules: [
    {
      title: "Entrada e abastecimento orientados",
      description: "Compras, recebimento e reposição conectados para manter estoque saudável.",
    },
    {
      title: "Rotina fiscal com governança",
      description: "Regras tributárias e validações centralizadas para reduzir inconsistências.",
    },
    {
      title: "Operação comercial com controle",
      description: "Preço, margem e desempenho por categoria para apoiar escala com disciplina.",
    },
  ],
  ctas: [
    { label: "Solicitar contato comercial", href: "/contato", kind: "primary" },
    { label: "Ver documentação e roadmap", href: "https://docs.proforma.net.br/", kind: "secondary" },
  ],
};
