import Link from "next/link";

export default function Home() {
  return (
    <main className="portal-shell">
      <section className="portal-card">
        <h1>Portal Proforma Platform</h1>
        <p>
          Esta aplicação é dedicada à experiência do cliente, separada do site público
          institucional.
        </p>
        <ul>
          <li>
            <Link href="/portal">Acessar área principal do portal</Link>
          </li>
          <li>
            <Link href="/portal/suporte">Ir para suporte</Link>
          </li>
          <li>
            <Link href="/portal/ajuda">Ir para central de ajuda</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
