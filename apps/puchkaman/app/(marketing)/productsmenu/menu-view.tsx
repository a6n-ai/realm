"use client";

import { useEffect, useRef, useState } from "react";
import type { FileDetail } from "@realm/storage/model";
import { Btn, Ph, PageBanner } from "@/components/brutal/shared";
import { ProductImage } from "@/components/products/product-image";
import { TAG_STYLE } from "@/lib/menu-categories";

export type MenuItem = {
  publicId: string;
  name: string;
  description: string | null;
  price: number;
  image: FileDetail | null;
  tags: string[];
};

export type MenuCategory = {
  id: string;
  name: string;
  emoji: string;
  note: string;
  items: MenuItem[];
};

export function MenuView({ categories }: { categories: MenuCategory[] }) {
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

  if (categories.length === 0) {
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
        <div className="wrap" style={{ padding: "40px 20px 80px" }}>
          <Ph label="menu coming soon" ratio="16 / 9" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBanner
        kicker="Eat The Streets"
        title="The Full Menu"
        sub="Fresh puchkas, viral fusions, chaats, rolls & summer drinks. Tap a category to jump."
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
      />

      {/* sticky category rail */}
      <div style={{ position: "sticky", top: 70, zIndex: 30, background: "var(--white)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ overflowX: "auto" }} ref={railRef}>
          <div className="flex" style={{ gap: 8, padding: "12px 0" }}>
            {categories.map((c) => (
              <button
                key={c.id}
                data-c={c.id}
                onClick={(e) => jump(c.id, e)}
                style={{
                  whiteSpace: "nowrap",
                  fontWeight: 800,
                  fontSize: "0.85rem",
                  padding: "9px 14px",
                  borderRadius: 999,
                  border: "2.5px solid var(--ink)",
                  background: active === c.id ? "var(--ink-bg)" : "var(--cream)",
                  color: active === c.id ? "var(--yellow)" : "var(--ink)",
                  boxShadow: active === c.id ? "3px 3px 0 var(--red)" : "none",
                  flexShrink: 0,
                  transition: "all .12s ease",
                }}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* categories */}
      <div style={{ background: "var(--paper)" }}>
        <div className="wrap" style={{ padding: "40px 20px 80px" }}>
          {categories.map((cat) => (
            <section key={cat.id} id={"cat-" + cat.id} style={{ marginBottom: 56, scrollMarginTop: 140 }}>
              <div className="flex center wrap-gap" style={{ gap: 14, marginBottom: 8 }}>
                <span style={{ fontSize: 34 }}>{cat.emoji}</span>
                <h2 className="display" style={{ fontSize: "clamp(1.7rem, 4.5vw, 2.6rem)" }}>{cat.name}</h2>
              </div>
              <p style={{ fontWeight: 500, opacity: 0.75, marginBottom: 22, fontFamily: "var(--mono)", fontSize: "0.86rem" }}>{cat.note}</p>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(228px, 1fr))", gridAutoRows: "1fr" }}>
                {cat.items.map((item) => (
                  <div
                    key={item.publicId}
                    className="card card--lift"
                    style={{ overflow: "hidden", height: "100%", display: "flex", flexDirection: "column", background: item.tags.includes("viral") ? "var(--cream)" : "var(--white)" }}
                  >
                    <div style={{ position: "relative" }}>
                      <ProductImage image={item.image} name={item.name} />
                      {item.tags.length > 0 && (
                        <div className="flex" style={{ position: "absolute", top: 9, left: 9, gap: 5, flexWrap: "wrap", maxWidth: "88%" }}>
                          {item.tags.map((t) => (
                            <span
                              key={t}
                              className="pill"
                              style={{
                                fontSize: "0.6rem",
                                padding: "4px 8px",
                                borderWidth: 2,
                                boxShadow: "2px 2px 0 var(--ink)",
                                background: t === "viral" ? "var(--red)" : t === "new" ? "var(--mint)" : "var(--yellow)",
                                color: t === "viral" || t === "new" ? "#fff" : "var(--ink-deep)",
                              }}
                            >
                              {TAG_STYLE[t]?.label ?? t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ padding: "14px 15px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
                      <div className="flex" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                        <h3 style={{ fontSize: "1.08rem", lineHeight: 1.05 }}>{item.name}</h3>
                        <span className="display" style={{ fontSize: "1.12rem", color: "var(--red)", flexShrink: 0 }}>${item.price.toFixed(0)}</span>
                      </div>
                      <p className="clamp-2" style={{ fontSize: "0.85rem", fontWeight: 500, opacity: 0.8, minHeight: "2.4em" }}>{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* order CTA */}
          <div className="card card--ink surface-ink" style={{ color: "var(--cream)", padding: "clamp(26px,4vw,44px)", textAlign: "center" }}>
            <h2 className="display" style={{ fontSize: "clamp(1.8rem,5vw,3rem)", color: "var(--yellow)" }}>Hungry Yet?</h2>
            <p style={{ fontWeight: 500, margin: "12px 0 22px" }}>Order pickup to skip the delivery fees, or get it delivered to your door.</p>
            <div className="flex wrap-gap" style={{ justifyContent: "center" }}>
              <Btn page="order" variant="red" size="lg">🛵 Order Pickup</Btn>
              <Btn page="order" variant="yellow" size="lg">🚗 Order Delivery</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
