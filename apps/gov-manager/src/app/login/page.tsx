'use client';

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorCode, setErrorCode] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorCode("");

    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setErrorCode(String(payload?.error_code || "AUTH_FAILED"));
        setStatus("error");
        return;
      }

      window.location.href = "/";
    } catch {
      setErrorCode("NETWORK_ERROR");
      setStatus("error");
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-logo">
          <img className="auth-seal" src="/selo-govhub.png" alt="Selo Gov-Hub" />
          <strong>gov-manager</strong>
        </div>
        <h1>Entrar</h1>
        <p>Acesso ao painel de governanca e operacao de missoes.</p>

        <label>
          Usuario
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="staff"
            autoComplete="username"
            required
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Entrando..." : "Acessar"}
        </button>

        {status === "error" ? <small>Falha de autenticacao: {errorCode}</small> : null}
      </form>
    </main>
  );
}
