/** Segmented progress bar shared by the subscribe wizard and checkout, so the two read as one flow. */
export function Progress({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <nav aria-label="Progress" className="mb-6">
      <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((name, i) => (
          <li key={name} aria-current={i === current ? "step" : undefined}>
            <span className={`block h-1 rounded-full transition-colors duration-300 ${i <= current ? "bg-primary" : "bg-border"}`} />
            <span className={`mt-1.5 block truncate text-xs font-semibold ${i === current ? "text-foreground" : "text-muted-foreground"}`}>{name}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
