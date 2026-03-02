import type { Product } from "./types";

export const medcoreProduct: Product = {
  slug: "medcore",
  name: "MedCore",
  tagline: "Plataforma clínica com governança de dados e estrutura preparada para escala.",
  description:
    "O MedCore centraliza operação clínica e dados críticos com base modular para evolução contínua em ambientes de saúde.",
  ogImage: "/brand/mark.svg",
  seo: {
    title: "MedCore",
    description:
      "Plataforma clínica para estruturar processos auditáveis e evoluir serviços com governança.",
  },
  features: [
    {
      title: "Dados clínicos centralizados",
      description: "Contexto único para reduzir fragmentação de informação assistencial.",
    },
    {
      title: "Processos auditáveis",
      description: "Rastreabilidade operacional para suportar controle e melhoria contínua.",
    },
    {
      title: "Arquitetura modular",
      description: "Evolução por módulos sem ruptura de base.",
    },
    {
      title: "Preparação para integrações",
      description: "Fundação técnica para conectar fluxos clínicos e administrativos.",
    },
  ],
  modules: [
    {
      title: "Base clínica",
      description: "Estrutura central para dados e jornadas de atendimento.",
    },
    {
      title: "Operação administrativa",
      description: "Orquestração de processos de apoio com governança operacional.",
    },
    {
      title: "Relatórios de governança",
      description: "Métricas para acompanhamento de performance e conformidade.",
    },
  ],
  ctas: [
    { label: "Solicitar contato comercial", href: "/contato", kind: "primary" },
    { label: "Ver documentação e roadmap", href: "https://docs.proforma.net.br/", kind: "secondary" },
  ],
};
