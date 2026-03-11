'use client';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ marginBottom: 8 }}>Falha crítica no GOV-Manager</h1>
        <p style={{ marginBottom: 16 }}>
          Ocorreu um erro inesperado no carregamento global da aplicação.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: '1px solid #444',
            borderRadius: 8,
            padding: '8px 14px',
            cursor: 'pointer',
            background: '#111',
            color: '#fff'
          }}
        >
          Tentar novamente
        </button>
        <pre
          style={{
            marginTop: 16,
            background: '#f6f6f6',
            padding: 12,
            borderRadius: 8,
            overflowX: 'auto'
          }}
        >
          {String(error?.message || 'UNKNOWN_GLOBAL_ERROR')}
        </pre>
      </body>
    </html>
  );
}
