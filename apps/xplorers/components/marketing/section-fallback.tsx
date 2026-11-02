/** Placeholder for a streamed marketing section; keeps the layout from jumping. */
export function SectionFallback({ height, label = "Loading" }: { height: number; label?: string }) {
  return <div className="xl-fallback" style={{ minHeight: height }} role="status" aria-busy="true" aria-label={label} />;
}
