import type { Metadata } from "next";
import "./globals.css";
import RuntimeGuard from "./runtime-guard";

export const metadata: Metadata = {
  title: "Gov-Hub Manager",
  description: "Painel oficial de governanca operacional do Gov-Hub",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const runtimeGuardScript = `
    (function () {
      var shown = false;
      var showFallback = function (reason) {
        if (shown) return;
        shown = true;
        var root = document.createElement('div');
        root.setAttribute('id', 'gov-runtime-fallback');
        root.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#0f1115;color:#e7eaef;font-family:system-ui,sans-serif;padding:24px;display:flex;align-items:center;justify-content:center;';
        root.innerHTML =
          '<div style="max-width:720px;width:100%;">' +
          '<h1 style="margin:0 0 8px 0;font-size:24px;">Falha ao carregar o GOV-Manager</h1>' +
          '<p style="margin:0 0 12px 0;color:#9aa3b2;">Erro de runtime detectado. Recarregue o painel.</p>' +
          '<pre style="background:#161a21;border:1px solid #2a2f3a;border-radius:8px;padding:10px;overflow:auto;">' + String(reason || 'UNKNOWN_RUNTIME_ERROR') + '</pre>' +
          '<button id="gov-runtime-reload" style="margin-top:12px;padding:8px 14px;border-radius:8px;border:1px solid #2a2f3a;background:#111;color:#fff;cursor:pointer;">Recarregar</button>' +
          '</div>';
        document.body.appendChild(root);
        var btn = document.getElementById('gov-runtime-reload');
        if (btn) btn.addEventListener('click', function () { window.location.reload(); });
      };

      window.addEventListener('error', function (ev) {
        showFallback((ev && ev.message) || 'WINDOW_ERROR');
      });
      window.addEventListener('unhandledrejection', function (ev) {
        var msg = ev && ev.reason ? (ev.reason.message || String(ev.reason)) : 'UNHANDLED_REJECTION';
        showFallback(msg);
      });

      window.setTimeout(function () {
        var path = window.location.pathname || '';
        if (path !== '/') return;
        var hasShell = !!document.querySelector('.gm-shell');
        if (!hasShell) showFallback('APP_NOT_MOUNTED_TIMEOUT');
      }, 5000);
    })();
  `;

  return (
    <html lang="pt-BR" data-theme="dark">
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: runtimeGuardScript }} />
        {children}
      </body>
    </html>
  );
}
