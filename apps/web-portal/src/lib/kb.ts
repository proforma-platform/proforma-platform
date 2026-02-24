export type KbArticle = {
  slug: string;
  title: string;
  category: "Onboarding" | "Operação" | "Segurança" | "Suporte";
  summary: string;
  updatedAt: string;
  sections: Array<{ heading: string; content: string }>;
};

export const KB_ARTICLES: KbArticle[] = [
  {
    slug: "primeiro-acesso-portal",
    title: "Primeiro acesso ao portal",
    category: "Onboarding",
    summary:
      "Passo a passo inicial para entrar no portal e localizar os principais módulos.",
    updatedAt: "2026-02-24",
    sections: [
      {
        heading: "Contexto",
        content:
          "Nesta fase, o portal ainda não possui autenticação real. O objetivo é orientar navegação e fluxos de suporte.",
      },
      {
        heading: "Passos recomendados",
        content:
          "Acesse /portal, revise as seções de Ajuda, Suporte e Ouvidoria, e registre dúvidas operacionais no fluxo de suporte.",
      },
    ],
  },
  {
    slug: "abertura-de-ticket",
    title: "Como abrir um ticket de suporte",
    category: "Suporte",
    summary: "Fluxo recomendado para registrar incidente ou solicitação técnica.",
    updatedAt: "2026-02-24",
    sections: [
      {
        heading: "Quando abrir",
        content:
          "Abra ticket para incidentes, comportamento inesperado, falhas de integração e dúvidas operacionais com impacto no uso.",
      },
      {
        heading: "Informações mínimas",
        content:
          "Inclua contexto, horário, evidências, passos de reprodução e impacto percebido para acelerar a triagem.",
      },
    ],
  },
  {
    slug: "boas-praticas-seguranca-portal",
    title: "Boas práticas de segurança no portal",
    category: "Segurança",
    summary:
      "Recomendações para uso seguro da plataforma durante operação diária.",
    updatedAt: "2026-02-24",
    sections: [
      {
        heading: "Boas práticas",
        content:
          "Evite compartilhar dados sensíveis em canais não oficiais e registre evidências técnicas com mínimo de exposição.",
      },
      {
        heading: "Escalonamento",
        content:
          "Suspeitas de incidente devem seguir o runbook de incident response e registro no fluxo de governança.",
      },
    ],
  },
];

export const KB_CATEGORIES = [
  "Onboarding",
  "Operação",
  "Segurança",
  "Suporte",
] as const;

export function getKbArticleBySlug(slug: string) {
  return KB_ARTICLES.find((article) => article.slug === slug);
}
