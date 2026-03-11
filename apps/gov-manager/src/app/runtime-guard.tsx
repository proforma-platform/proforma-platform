'use client';

import { useEffect, useState } from "react";

export default function RuntimeGuard() {
  const [reason, setReason] = useState("");

  useEffect(() => {
    const show = (value: unknown) => {
      setReason(String(value || "UNKNOWN_RUNTIME_ERROR"));
    };

    const onError = (event: ErrorEvent) => show(event?.message || "WINDOW_ERROR");
    const onRejection = (event: PromiseRejectionEvent) =>
      show(event?.reason?.message || String(event?.reason || "UNHANDLED_REJECTION"));

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const timeout = window.setTimeout(() => {
      if (window.location.pathname !== "/") return;
      const hasShell = Boolean(document.querySelector(".gm-shell"));
      if (!hasShell) show("APP_NOT_MOUNTED_TIMEOUT");
    }, 5000);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.clearTimeout(timeout);
    };
  }, []);

  if (!reason) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "#0f1115",
        color: "#e7eaef",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <div style={{ maxWidth: 720, width: "100%" }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: 24 }}>Falha ao carregar o GOV-Manager</h1>
        <p style={{ margin: "0 0 12px 0", color: "#9aa3b2" }}>Erro de runtime detectado. Recarregue o painel.</p>
        <pre
          style={{
            background: "#161a21",
            border: "1px solid #2a2f3a",
            borderRadius: 8,
            padding: 10,
            overflow: "auto"
          }}
        >
          {reason}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 12,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #2a2f3a",
            background: "#111",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          Recarregar
        </button>
      </div>
    </div>
  );
}
