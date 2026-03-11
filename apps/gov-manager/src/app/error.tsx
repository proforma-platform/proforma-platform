'use client';

import { useEffect } from 'react';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GovManagerError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[gov-manager] route error', error);
  }, [error]);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 8 }}>Falha ao carregar o GOV-Manager</h1>
      <p style={{ marginBottom: 16 }}>
        O painel encontrou um erro em runtime. Tente recarregar esta seção.
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
        Recarregar painel
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
        {String(error?.message || 'UNKNOWN_RUNTIME_ERROR')}
      </pre>
    </main>
  );
}
