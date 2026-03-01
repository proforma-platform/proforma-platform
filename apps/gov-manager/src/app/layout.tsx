import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HUB-GOV V6 | OMNI-SYNAPSE",
  description: "Proforma Platform Governance Console",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-slate-950">
      <body className="antialiased">{children}</body>
    </html>
  );
}
