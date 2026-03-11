import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proforma Platform Portal",
  description: "Portal de suporte e relacionamento da Proforma Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <header className="portal-header">
          <div className="portal-shell portal-header-inner">
            <Link href="/" className="portal-brand" aria-label="Proforma Platform">
              <img src="/brand/logo.svg" alt="Proforma" width={160} height={40} />
            </Link>
          </div>
        </header>
        {children}
        <footer className="portal-footer">
          <div className="portal-shell">
            <p>© {new Date().getFullYear()} Proforma Platform</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
