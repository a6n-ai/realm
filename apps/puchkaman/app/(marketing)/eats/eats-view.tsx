"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FileDetail } from "@realm/storage/model";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { Btn, Ph, PageBanner, Pill } from "@/components/brutal/shared";
import { CloverColorSwatch } from "@/components/products/clover-color-swatch";
import { ProductImage } from "@/components/products/product-image";
import { PUBLIC_ORDERING_UNAVAILABLE_MESSAGE } from "@/lib/clover/public-ordering-copy";
import { TAG_STYLE } from "@/lib/menu-categories";

export type EatsItem = {
  publicId: string;
  name: string;
  description: string | null;
  price: number;
  image: FileDetail | null;
  tags: string[];
  /** Active + Clover-linked + in stock — eligible for pickup cart. */
  orderable: boolean;
  category: string;
  cloverColorCode: string | null;
};

export type EatsCategory = {
  id: string;
  name: string;
  emoji: string;
  note: string;
  items: EatsItem[];
};

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
  const [active, setActive] = useState(categories[0]?.id ?? "");
  const railRef = useRef<HTMLDivElement>(null);

  const jump = (id: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const el = document.getElementById("cat-" + id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 132;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const onScroll = () => {
      let cur = categories[0]?.id ?? "";
      for (const c of categories) {
        const el = document.getElementById("cat-" + c.id);
        if (el && el.getBoundingClientRect().top < 180) cur = c.id;
      }
      setActive(cur);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [categories]);

  useEffect(() => {
    const chip = railRef.current?.querySelector(`[data-c="${active}"]`);
    if (chip) chip.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

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

  return (
    <div>
      <PageBanner
        kicker="Eat The Streets"
        title="The Full Menu"
        sub={
          orderingEnabled
            ? "Tap a category to jump. Add available items to your pickup cart."
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

      <div style={{ position: "sticky", top: "var(--header-h)", zIndex: 30, background: "var(--white)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ overflowX: "auto" }} ref={railRef}>
          <div className="flex" style={{ gap: 8, padding: "12px 0" }}>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                data-c={c.id}
                onClick={(e) => jump(c.id, e)}
                style={{
                  whiteSpace: "nowrap",
                  fontWeight: 800,
                  fontSize: "0.85rem",
                  padding: "9px 14px",
                  minHeight: 44,
                  borderRadius: 999,
                  border: "2.5px solid var(--ink)",
                  background: active === c.id ? "var(--ink-bg)" : "var(--cream)",
                  color: active === c.id ? "#fff" : "var(--ink)",
                  boxShadow: active === c.id ? "3px 3px 0 var(--green)" : "none",
                  flexShrink: 0,
                  transition: "background .15s ease, box-shadow .15s ease, color .15s ease",
                }}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "var(--paper)" }}>
        <div className="wrap" style={{ padding: "clamp(24px, 6vw, 40px) 20px clamp(48px, 10vw, 80px)" }}>
          {categories.map((cat) => (
            <section key={cat.id} id={"cat-" + cat.id} style={{ marginBottom: "clamp(36px, 9vw, 56px)", scrollMarginTop: 140 }}>
              <div className="flex center wrap-gap" style={{ gap: 14, marginBottom: 8 }}>
                <span style={{ fontSize: 34 }} aria-hidden="true">
                  {cat.emoji}
                </span>
                <h2 className="display" style={{ fontSize: "clamp(1.7rem, 4.5vw, 2.6rem)" }}>
                  {cat.name}
                </h2>
              </div>
              <p
                style={{
                  fontWeight: 500,
                  opacity: 0.75,
                  marginBottom: 22,
                  fontFamily: "var(--mono)",
                  fontSize: "0.86rem",
                }}
              >
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
              <div
                className="grid eats-grid"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(228px, 1fr))", gridAutoRows: "1fr" }}
              >
                {cat.items.map((item) => (
                  <div
                    key={item.publicId}
                    className="card card--lift eats-card"
                    style={{
                      overflow: "hidden",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      background: item.tags.includes("viral") ? "var(--cream)" : "var(--white)",
                      opacity: orderingEnabled && !item.orderable ? 0.92 : 1,
                    }}
                  >
                    <div style={{ position: "relative" }}>
                      <ProductImage image={item.image} name={item.name} />
                      <div
                        className="flex"
                        style={{ position: "absolute", top: 9, left: 9, gap: 5, flexWrap: "wrap", maxWidth: "88%" }}
                      >
                        {orderingEnabled ? (
                          <span
                            className="pill"
                            style={{
                              fontSize: "0.6rem",
                              padding: "4px 8px",
                              borderWidth: 2,
                              boxShadow: "2px 2px 0 var(--ink)",
                              background: item.orderable ? "var(--mint)" : "var(--cream)",
                              color: item.orderable ? "#fff" : "var(--ink-deep)",
                            }}
                          >
                            {item.orderable ? "Available" : "Out of stock"}
                          </span>
                        ) : null}
                        {item.tags.map((t) => (
                          <span
                            key={t}
                            className="pill"
                            style={{
                              fontSize: "0.6rem",
                              padding: "4px 8px",
                              borderWidth: 2,
                              boxShadow: "2px 2px 0 var(--ink)",
                              background:
                                t === "viral" ? "var(--green)" : t === "new" ? "var(--mint)" : "var(--yellow)",
                              color: t === "viral" || t === "new" ? "#fff" : "var(--ink-deep)",
                            }}
                          >
                            {TAG_STYLE[t]?.label ?? t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ padding: "14px 15px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
                      <div
                        className="flex"
                        style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}
                      >
                        <h3
                          className="flex"
                          style={{ fontSize: "1.08rem", lineHeight: 1.15, alignItems: "flex-start", gap: 7, minWidth: 0 }}
                        >
                          <CloverColorSwatch
                            color={item.cloverColorCode}
                            size={12}
                            className="rounded-[1px] border-[1.5px] border-[var(--ink)] mt-[4px]"
                          />
                          <span className="clamp-2" style={{ minWidth: 0 }}>{item.name}</span>
                        </h3>
                        <span className="display" style={{ fontSize: "1.12rem", color: "var(--green)", flexShrink: 0, lineHeight: 1.15 }}>
                          ${item.price.toFixed(0)}
                        </span>
                      </div>
                      <p
                        className="clamp-2"
                        style={{ fontSize: "0.85rem", fontWeight: 500, opacity: 0.8, minHeight: "2.4em", flex: 1 }}
                      >
                        {item.description}
                      </p>
                      {orderingEnabled ? (
                        <div style={{ marginTop: 12 }}>
                          {item.orderable ? (
                            <AddToCartButton
                              block
                              item={{
                                productPublicId: item.publicId,
                                name: item.name,
                                price: item.price,
                                category: item.category,
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="btn btn--ink btn--block btn--sm btn--disabled"
                              disabled
                              aria-disabled="true"
                              aria-label={`${item.name} out of stock`}
                            >
                              Out of stock
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

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
  );
}
