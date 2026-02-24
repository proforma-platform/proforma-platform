import { notFound } from "next/navigation";
import { getKbArticleBySlug, KB_ARTICLES } from "@/lib/kb";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return KB_ARTICLES.map((article) => ({ slug: article.slug }));
}

export default async function KbArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getKbArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return (
    <section className="portal-card">
      <p className="kb-meta">
        {article.category} · Atualizado em {article.updatedAt}
      </p>
      <h2>{article.title}</h2>
      <p>{article.summary}</p>

      {article.sections.map((section) => (
        <section key={section.heading} className="kb-section">
          <h3>{section.heading}</h3>
          <p>{section.content}</p>
        </section>
      ))}
    </section>
  );
}
