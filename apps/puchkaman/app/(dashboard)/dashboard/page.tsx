import { Suspense } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { productsService, type ProductListRow } from "@/lib/services/products.service";
import { CATEGORIES, type CategoryId } from "@/lib/menu-categories";

export const dynamic = "force-dynamic";

export default function DashboardHomePage() {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="flex wrap-gap between" style={{ alignItems: "center" }}>
        <div>
          <p className="kicker" style={{ opacity: 0.55, marginBottom: 4 }}>
            Overview
          </p>
          <h1 className="display" style={{ fontSize: "1.8rem" }}>
            Dashboard
          </h1>
          <p style={{ opacity: 0.7, fontWeight: 500, marginTop: 4 }}>Your catalog at a glance.</p>
        </div>
        <Link href="/dashboard/products" className="btn btn--red btn--sm">
          Manage products <ArrowRightIcon size={16} />
        </Link>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData />
      </Suspense>
    </div>
  );
}

async function DashboardData() {
  await requireAdmin();

  const [stats, recent, featured] = await Promise.all([
    productsService.productStats(),
    productsService.recentProducts(6),
    productsService.featuredProducts(6),
  ]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <StatCard label="Total products" value={stats.total} fill="white" />
        <StatCard label="Featured" value={stats.featured} fill="yellow" />
        <StatCard label="Categories" value={stats.categories} fill="cream" />
        <StatCard label="Pending sync" value={stats.pendingSync} fill="red" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <ProductList title="Recent products" empty="No products yet." rows={recent} />
        <ProductList title="Featured products" empty="No featured products yet." rows={featured} />
      </div>
    </div>
  );
}

function StatCard({ label, value, fill }: { label: string; value: number; fill: "white" | "yellow" | "cream" | "red" }) {
  return (
    <div className={`card card--${fill}`} style={{ padding: "clamp(16px,2.4vw,22px)" }}>
      <p className="kicker" style={{ opacity: 0.65, marginBottom: 8 }}>
        {label}
      </p>
      <p className="display" style={{ fontSize: "2.1rem", lineHeight: 1 }}>
        {value}
      </p>
    </div>
  );
}

function ProductList({ title, empty, rows }: { title: string; empty: string; rows: ProductListRow[] }) {
  return (
    <section className="card" style={{ padding: "clamp(18px,2.6vw,24px)" }}>
      <p className="kicker" style={{ opacity: 0.55, marginBottom: 14 }}>
        {title}
      </p>
      {rows.length === 0 ? (
        <p style={{ opacity: 0.6, fontWeight: 500 }}>{empty}</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((p) => (
            <div
              key={p.publicId}
              className="flex between"
              style={{ alignItems: "center", gap: 12, paddingBottom: 10, borderBottom: "2px solid var(--ink)" }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </p>
                <p style={{ opacity: 0.6, fontWeight: 500, fontSize: "0.82rem" }}>
                  {CATEGORIES[p.category as CategoryId]?.name ?? p.category}
                </p>
              </div>
              <p style={{ fontWeight: 700, whiteSpace: "nowrap" }}>${Number(p.price).toFixed(2)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: "clamp(16px,2.4vw,22px)", display: "grid", gap: 10 }}>
            <div style={{ height: 12, width: 80, background: "var(--paper, rgba(0,0,0,.08))", borderRadius: 4 }} />
            <div style={{ height: 26, width: 50, background: "var(--paper, rgba(0,0,0,.06))", borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {[0, 1].map((i) => (
          <div key={i} className="card" style={{ padding: "clamp(18px,2.6vw,24px)", display: "grid", gap: 12 }}>
            <div style={{ height: 12, width: 100, background: "var(--paper, rgba(0,0,0,.08))", borderRadius: 4 }} />
            {[0, 1, 2].map((j) => (
              <div key={j} style={{ height: 40, background: "var(--paper, rgba(0,0,0,.06))", borderRadius: 4 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
