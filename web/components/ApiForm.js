'use client';
// A form that sends its fields as JSON to one of our Route Handlers,
// then shows the result (or the database's error message) and refreshes the page.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ApiForm({ to, method = 'POST', submit = 'Save', children, reset = true, className = 'form-row' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setNote(null);
    const body = Object.fromEntries(new FormData(form));
    const res = await fetch(to, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setNote({ type: 'err', text: data.error || 'Something went wrong.' });
      return;
    }
    setNote({ type: 'ok', text: data.message || 'Saved.' });
    if (reset) form.reset();
    if (data.redirect) router.push(data.redirect);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <div className={className}>
        {children}
        <button className="btn primary" disabled={busy}>{busy ? 'Working…' : submit}</button>
      </div>
      {note && <div className={`notice ${note.type}`}>{note.text}</div>}
    </form>
  );
}
