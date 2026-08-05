"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Btn, Ph, PageBanner, Pill } from "@/components/brutal/shared";
import { PUBLIC_ORDERING_UNAVAILABLE_MESSAGE } from "@/lib/clover/public-ordering-copy";
import { EatsCard } from "./eats-card";
import { EatsFilterPanel } from "./eats-filter-panel";
import {
  activeFilterCount,
  availableTags,
  countItems,
  EMPTY_FILTERS,
  filterCategories,
  type EatsCategory,
  type EatsFilterState,
} from "./eats-filters";

export type { EatsCategory, EatsItem } from "./eats-filters";

export function EatsView({
  categories,
  totalProducts,
  orderingEnabled,
}: {
  categories: EatsCategory[];
  totalProducts: number;
  /** When false, browse-only: no Add to cart / Available / Out of stock CTAs. */
  orderingEnabled: boolean;
}) {
  const [filters, setFilters] = useState<EatsFilterState>(EMPTY_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);

  const tags = useMemo(() => availableTags(categories), [categories]);
  const shown = useMemo(() => filterCategories(categories, filters), [categories, filters]);
  const shownCount = countItems(shown);
  const activeCount = activeFilterCount(filters);

  // Empty only when the products table has zero rows.
  if (totalProducts === 0) {
    return (
      <div>
        <PageBanner
          kicker="Eat The Streets"
          title="The Full Menu"
          sub="Fresh puchkas, viral fusions, chaats, rolls & summer drinks."
          bg="var(--page-bg)"
          color="var(--ink)"
          surface="surface-yellow"
        />
        <div className="wrap" style={{ padding: "clamp(24px, 6vw, 40px) 20px clamp(48px, 10vw, 80px)" }}>
          <div className="card card--cream" style={{ padding: 28, marginBottom: 20 }}>
            <h2 className="display" style={{ fontSize: "1.5rem", marginBottom: 10 }}>
              No products yet
            </h2>
            <p style={{ fontWeight: 500, marginBottom: 16, opacity: 0.85 }}>
              The menu is empty because there are no products in the catalog. Add products in admin,
              or sync from Uber Eats / Clover — then items will show here.
            </p>
            <Btn page="order" variant="green">
              Other ways to order →
            </Btn>
          </div>
          <Ph label="menu empty" ratio="16 / 9" />
        </div>
      </div>
    );
  }

  const panel = (
    <EatsFilterPanel
      categories={categories}
      tags={tags}
      value={filters}
      onChange={setFilters}
      orderingEnabled={orderingEnabled}
    />
  );

  return (
    <div>
      <PageBanner
        kicker="Eat The Streets"
        title="The Full Menu"
        sub={
          orderingEnabled
            ? "Search, filter by section, and add available items to your pickup cart."
            : "Browse the menu. Online pickup ordering is coming soon — delivery apps are live."
        }
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
        crumb="Menu"
      />

      {!orderingEnabled ? (
        <div style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
          <div className="wrap" style={{ padding: "18px 20px" }}>
            <div className="card card--cream" style={{ padding: "16px 18px", opacity: 0.96 }}>
              <div className="flex center wrap-gap" style={{ gap: 10, marginBottom: 8 }}>
                <Pill variant="ink">Coming soon</Pill>
                <span style={{ fontWeight: 800, fontSize: "0.95rem" }}>Pickup ordering soon</span>
              </div>
              <p style={{ fontWeight: 500, opacity: 0.85, margin: 0, fontSize: "0.9rem" }}>
                {PUBLIC_ORDERING_UNAVAILABLE_MESSAGE}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Phones: the section chips ARE the category filter, so tapping one narrows
          the menu instead of scroll-jumping to it. Desktop uses the sidebar. */}
      <div className="eats-railbar">
        <div className="wrap eats-railbar__inner">
          <div className="eats-rail">
            {categories.map((c) => {
              const on = filters.categoryIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  className={`eats-railchip ${on ? "is-on" : ""}`}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      categoryIds: on
                        ? f.categoryIds.filter((id) => id !== c.id)
                        : [...f.categoryIds, c.id],
                    }))
                  }
                >
                  <span aria-hidden="true">{c.emoji}</span> {c.name}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="eats-filterbtn"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((v) => !v)}
          >
            {panelOpen ? "Hide filters" : "Filters"}
            {activeCount ? <span className="eats-filterbtn__count">{activeCount}</span> : null}
          </button>
        </div>
        {panelOpen ? (
          <div className="wrap eats-railbar__panel">{panel}</div>
        ) : null}
      </div>

      <div style={{ background: "var(--paper)" }}>
        <div className="wrap eats-shell">
          <aside className="eats-sidebar">{panel}</aside>

          <div className="eats-results">
            <p className="eats-count" aria-live="polite">
              {shownCount} item{shownCount === 1 ? "" : "s"}
              {activeCount ? (
                <>
                  {" "}
                  <button type="button" className="eats-count__clear" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Clear filters
                  </button>
                </>
              ) : null}
            </p>

            {shown.length === 0 ? (
              <div className="card card--cream eats-empty">
                <h2 className="display" style={{ fontSize: "1.4rem", marginBottom: 8 }}>
                  Nothing matches that
                </h2>
                <p style={{ fontWeight: 500, opacity: 0.85, marginBottom: 16 }}>
                  Try a shorter search, or drop a filter or two.
                </p>
                <Btn variant="green" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Show the whole menu
                </Btn>
              </div>
            ) : (
              shown.map((cat) => (
                <section key={cat.id} id={"cat-" + cat.id} className="eats-section">
                  <div className="flex center wrap-gap" style={{ gap: 14, marginBottom: 8 }}>
                    <span style={{ fontSize: 34 }} aria-hidden="true">
                      {cat.emoji}
                    </span>
                    <h2 className="display" style={{ fontSize: "clamp(1.7rem, 4.5vw, 2.6rem)" }}>
                      {cat.name}
                    </h2>
                  </div>
                  {cat.note || cat.id === "fusion" ? (
                    <p className="eats-section__note">
                      {cat.note}
                      {cat.id === "fusion" && (
                        <>
                          {" "}
                          <Link href="/fusion" style={{ textDecoration: "underline" }}>
                            Learn more about fusion puchkas →
                          </Link>
                        </>
                      )}
                    </p>
                  ) : null}
                  <div
                    className="grid eats-grid"
                    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(228px, 1fr))", gridAutoRows: "1fr" }}
                  >
                    {cat.items.map((item) => (
                      <EatsCard key={item.publicId} item={item} orderingEnabled={orderingEnabled} />
                    ))}
                  </div>
                </section>
              ))
            )}

            <div
              className="card card--ink surface-ink"
              style={{ color: "var(--cream)", padding: "clamp(26px,4vw,44px)", textAlign: "center" }}
            >
              <h2 className="display" style={{ fontSize: "clamp(1.8rem,5vw,3rem)", color: "var(--yellow)" }}>
                Hungry Yet?
              </h2>
              <p style={{ fontWeight: 500, margin: "12px 0 22px" }}>
                {orderingEnabled
                  ? "Checkout pickup when your cart is ready, or order delivery through the apps."
                  : "Online pickup is coming soon — order delivery through the apps for now."}
              </p>
              <div className="flex wrap-gap" style={{ justifyContent: "center" }}>
                {orderingEnabled ? (
                  <Btn page="cart" variant="green" size="lg">
                    View cart →
                  </Btn>
                ) : null}
                <Btn page="order" variant="yellow" size="lg">
                  Delivery apps
                </Btn>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
