// Next's automatic Suspense boundary for every route under (marketing) — every
// page here is force-dynamic (Clover/org-dependent), so without this the user
// sees nothing at all (stale previous page, no feedback) while the server
// round-trip runs. Reuses .skeleton (globals.css), the same shimmer the admin
// side already uses, so it reads as "loading", not a broken layout.
export default function MarketingLoading() {
  return (
    <div className="wrap" style={{ padding: "40px 20px", display: "grid", gap: 16 }}>
      <div className="skeleton" style={{ height: 32, width: "60%", maxWidth: 420 }} />
      <div className="skeleton" style={{ height: 16, width: "90%", maxWidth: 640 }} />
      <div className="skeleton" style={{ height: 16, width: "75%", maxWidth: 520 }} />
      <div
        style={{
          marginTop: 12,
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 180, borderRadius: "var(--r)" }} />
        ))}
      </div>
    </div>
  );
}
