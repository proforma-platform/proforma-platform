import Link from "next/link";
import { KB_ARTICLES, KB_CATEGORIES } from "@/lib/kb";

export default function PortalAjudaPage() {
  return (
    <section className="portal-card">
      <h2>Central de Ajuda</h2>
      <p>
        Base de conhecimento integrada com guias, dúvidas frequentes e boas práticas
        operacionais do portal.
      </p>

      <div className="kb-categories" aria-label="Categorias da base de conhecimento">
        {KB_CATEGORIES.map((category) => (
          <span key={category} className="kb-chip">
            {category}
          </span>
        ))}
      </div>

      <div className="kb-grid">
        {KB_ARTICLES.map((article) => (
          <article key={article.slug} className="kb-item">
            <p className="kb-meta">
              {article.category} · Atualizado em {article.updatedAt}
            </p>
            <h3>
              <Link href={`/portal/ajuda/${article.slug}`}>{article.title}</Link>
            </h3>
            <p>{article.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
