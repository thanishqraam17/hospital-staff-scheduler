// Small display pieces shared by pages (server components).

export function Header({ kicker, title, children }) {
  return (
    <header>
      <div className="kicker">{kicker}</div>
      <h1 className="title">{title}</h1>
      {children && <p className="lede">{children}</p>}
    </header>
  );
}

export function Section({ title, note, children }) {
  return (
    <section>
      <h2 className="section">
        {title}
        {note && <span>{note}</span>}
      </h2>
      {children}
    </section>
  );
}

export function Tag({ value }) {
  return <span className={`tag ${value}`}>{value}</span>;
}

// 10-tick strip coloured by risk level
export function Meter({ score, level }) {
  const on = Math.round(Number(score) / 10);
  return (
    <span className={`meter ${level}`} title={`${score} / 100`}>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={i < on ? 'on' : ''} />
      ))}
    </span>
  );
}

export function Mood({ value }) {
  const n = Number(value);
  return <span className="mood" title={`Mood ${n} of 5`}>{'●'.repeat(n)}{'○'.repeat(5 - n)}</span>;
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

// Filter chips that change a query-string value
export function Filters({ base, name, value, options, keep = {} }) {
  return (
    <div className="filters">
      {options.map(([label, v]) => {
        const params = new URLSearchParams({ ...keep });
        if (v !== '') params.set(name, v);
        const href = params.toString() ? `${base}?${params}` : base;
        return (
          <a key={label} href={href} className={String(value ?? '') === String(v) ? 'on' : ''}>
            {label}
          </a>
        );
      })}
    </div>
  );
}
