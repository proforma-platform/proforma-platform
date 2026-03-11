import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gov-Hub Manager",
  description: "Painel oficial de governanca operacional do Gov-Hub",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-theme="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
