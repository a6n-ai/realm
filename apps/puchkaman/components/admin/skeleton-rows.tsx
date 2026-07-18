export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div style={{ display: "grid", gap: 12 }} aria-busy="true" aria-label="Loading products">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex center"
          style={{
            gap: 16,
            padding: "12px 16px",
            border: "var(--bd) solid var(--ink)",
            borderRadius: "var(--r-sm)",
            background: "var(--white)",
          }}
        >
          <div className="skeleton" style={{ width: 44, height: 44, flexShrink: 0 }} />
          <div className="skeleton" style={{ height: 14, width: "22%" }} />
          <div className="skeleton" style={{ height: 14, width: "14%" }} />
          <div className="skeleton" style={{ height: 14, width: "8%", marginLeft: "auto" }} />
          <div className="skeleton" style={{ height: 22, width: 70, borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}
