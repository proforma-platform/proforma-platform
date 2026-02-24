import Link from "next/link";
import HelpLauncher from "@/components/HelpLauncher";

export default function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="portal-shell">
      <header>
        <h1>Área do Cliente</h1>
        <nav className="portal-nav" aria-label="Navegação do portal">
          <Link href="/portal">Dashboard</Link>
          <Link href="/portal/suporte">Suporte</Link>
          <Link href="/portal/ouvidoria">Ouvidoria</Link>
          <Link href="/portal/ajuda">Ajuda</Link>
          <Link href="/portal/conta">Conta</Link>
        </nav>
      </header>
      {children}
      <HelpLauncher />
    </main>
  );
}
