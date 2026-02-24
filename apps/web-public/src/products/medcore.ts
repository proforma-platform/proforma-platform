import type { Product } from "./types";

export const medcoreProduct: Product = {
  slug: "medcore",
  name: "MedCore",
  tagline: "Jornada do paciente com eficiência clínica e operação padronizada.",
  description:
    "MedCore integra atendimento, dados clínicos e rotinas operacionais para elevar qualidade assistencial com governança e previsibilidade.",
  ogImage: "/brand/mark.svg",
  seo: {
    title: "MedCore",
    description:
      "Plataforma clínica para estruturar processos auditáveis e evoluir serviços com governança.",
  },
  features: [
    {
      title: "Jornada do paciente conectada",
      description: "Atendimento, histórico e evolução clínica unificados para decisões com contexto completo.",
    },
    {
      title: "Eficiência clínica com menor retrabalho",
      description: "Fluxos estruturados de triagem, atendimento e registro para aumentar produtividade da equipe.",
    },
    {
      title: "Padronização e qualidade assistencial",
      description: "Protocolos e processos auditáveis para reduzir variação operacional entre unidades.",
    },
    {
      title: "Operação hospitalar e odonto preparada",
      description: "Base modular para expansão de serviços sem perder governança de dados.",
    },
  ],
  modules: [
    {
      title: "Gestão de atendimento e agenda",
      description: "Organização de fluxo assistencial com visibilidade de capacidade e tempo.",
    },
    {
      title: "Prontuário e dados estruturados",
      description: "Registro clínico consistente para apoiar continuidade e segurança do cuidado.",
    },
    {
      title: "Governança operacional e indicadores",
      description: "Métricas de desempenho para evolução contínua de processos e resultados.",
    },
  ],
  ctas: [
    { label: "Solicitar contato comercial", href: "/contato", kind: "primary" },
    { label: "Ver documentação e roadmap", href: "https://docs.proforma.net.br/", kind: "secondary" },
  ],
};
