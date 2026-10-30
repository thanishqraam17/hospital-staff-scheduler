'use client';
// One-click action (approve, cancel, delete) that calls a Route Handler.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ActionButton({ to, method = 'POST', body, label, danger = false }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch(to, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error || 'Failed');
    else router.refresh();
  }

  return (
    <span>
      <button className={`btn small ${danger ? 'danger' : ''}`} onClick={run} disabled={busy}>
        {busy ? '…' : label}
      </button>
      {error && <div className="notice err">{error}</div>}
    </span>
  );
}
