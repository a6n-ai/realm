export type Faq = { q: string; a: string };

/**
 * FAQ accordion built on native <details>/<summary>: no JS ships, it works
 * before hydration, and keyboard/screen-reader behaviour comes from the
 * platform. `name` makes the group single-open in browsers that support it
 * (Baseline 2024); older ones just allow several open at once, which is a
 * fine fallback rather than a broken one.
 */
export function FaqAccordion({
  items,
  name,
  defaultOpen = -1,
  className = "",
}: {
  items: Faq[];
  /** Shared name — only one item in the group stays open at a time. */
  name: string;
  /** Index rendered already-open, so the affordance is visible at a glance. */
  defaultOpen?: number;
  className?: string;
}) {
  return (
    <div className={`faq-list ${className}`.trim()}>
      {items.map((f, i) => (
        <details key={f.q} className="faq card" name={name} open={i === defaultOpen}>
          <summary className="faq__q">
            <span className="faq__q-text">{f.q}</span>
            <span className="faq__mark" aria-hidden="true">
              <i />
              <i />
            </span>
          </summary>
          <div className="faq__a">
            <p>{f.a}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
