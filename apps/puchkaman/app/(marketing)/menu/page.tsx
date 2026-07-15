"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, Ph, PageBanner } from "@/components/brutal/shared";

type Item = [string, string, string, string[]];
type Category = { id: string; name: string; emoji: string; note: string; items: Item[] };

const MENU: Category[] = [
  {
    id: "trad",
    name: "Traditional Puchkas",
    emoji: "💧",
    note: "The Kolkata classics. Crispy shells, spiced water.",
    items: [
      ["Aloo Puchka", "Spiced potato, tangy tamarind water.", "$6", ["best"]],
      ["Dahi Puchka", "Sweet yogurt, chutneys, crunch.", "$7", []],
      ["Hing Puchka", "Bold asafoetida-spiked water.", "$6", []],
      ["Meetha Puchka", "Extra-sweet tamarind for the kids.", "$6", []],
      ["Dry Masala Puchka", "No water, all the masala.", "$7", []],
    ],
  },
  {
    id: "fusion",
    name: "Fusion Puchkas",
    emoji: "🔥",
    note: "Our viral hero. Global flavours, OG crunch.",
    items: [
      ["Chicken Corn Cheese Puchka", "Creamy, cheesy, the internet favourite.", "$10", ["best", "viral"]],
      ["Firangi Chicken Puchka", "Western-spiced smoky chicken.", "$10", ["viral"]],
      ["Paneer Schezwan Puchka", "Indo-Chinese heat in a shell.", "$9", ["viral"]],
      ["Spicy Chicken Blast Puchka", "For the heat-seekers only.", "$10", []],
      ["Veg Mo-Puchka", "Momo filling meets puchka.", "$9", ["new"]],
      ["Paneer Mo-Puchka", "Paneer momo-puchka mashup.", "$9", ["new"]],
    ],
  },
  {
    id: "vada",
    name: "Vada Pav",
    emoji: "🍔",
    note: "Mumbai's spicy potato slider.",
    items: [
      ["Classic Vada Pav", "Garlic chutney, fried chilli.", "$6", ["best"]],
      ["Cheese Vada Pav", "Molten cheese upgrade.", "$7", []],
      ["Schezwan Vada Pav", "Indo-Chinese kick.", "$7", []],
    ],
  },
  {
    id: "bhaji",
    name: "Pav Bhaji",
    emoji: "🧈",
    note: "Buttery mashed-veg curry with toasted pav.",
    items: [
      ["Classic Pav Bhaji", "Loaded with butter & lime.", "$10", ["best"]],
      ["Cheese Pav Bhaji", "Extra cheese, extra love.", "$12", []],
      ["Paneer Pav Bhaji", "Paneer-rich twist.", "$12", []],
    ],
  },
  {
    id: "rolls",
    name: "Kathi Rolls & Wraps",
    emoji: "🌯",
    note: "Flaky paratha, smoky fillings.",
    items: [
      ["Chicken Kathi Roll", "Tandoori chicken, onions, chutney.", "$9", ["best"]],
      ["Paneer Kathi Roll", "Spiced paneer & peppers.", "$9", []],
      ["Egg Kathi Roll", "Classic anda roll.", "$8", []],
      ["Double Egg Chicken Roll", "The full Kolkata experience.", "$11", ["viral"]],
    ],
  },
  {
    id: "momos",
    name: "Momos",
    emoji: "🥟",
    note: "Steamed or fried, with fiery chutney.",
    items: [
      ["Veg Steamed Momos", "8 pcs, classic.", "$8", []],
      ["Chicken Steamed Momos", "8 pcs, juicy.", "$9", ["best"]],
      ["Schezwan Fried Momos", "Tossed in spicy schezwan.", "$10", ["viral"]],
    ],
  },
  {
    id: "chaat",
    name: "Chaats",
    emoji: "🥗",
    note: "Sweet, sour, spicy, crunchy — all at once.",
    items: [
      ["Bhel Puri", "Puffed rice, tamarind, crunch.", "$7", []],
      ["Sev Puri", "Crispy puris, loaded toppings.", "$8", ["best"]],
      ["Dahi Bhalla", "Soft lentil dumplings in yogurt.", "$8", []],
      ["Samosa Chaat", "Crushed samosa, chole, chutneys.", "$9", []],
    ],
  },
  {
    id: "maggi",
    name: "Maggi",
    emoji: "🍜",
    note: "Late-night comfort, desi-style.",
    items: [
      ["Classic Masala Maggi", "The nostalgia bowl.", "$6", []],
      ["Cheese Maggi", "Gooey and rich.", "$7", []],
      ["Chicken Maggi", "Protein-packed.", "$9", []],
    ],
  },
  {
    id: "sandwich",
    name: "Sandwiches",
    emoji: "🥪",
    note: "Grilled, buttered, Bombay-style.",
    items: [
      ["Bombay Veg Sandwich", "Chutney, veg, masala.", "$7", []],
      ["Cheese Chilli Sandwich", "Spicy & melty.", "$8", []],
      ["Chicken Tikka Sandwich", "Smoky tikka grilled.", "$9", []],
    ],
  },
  {
    id: "drinks",
    name: "Summer Drinks",
    emoji: "🥤",
    note: "Beat the GTA heat.",
    items: [
      ["Masala Soda", "Fizzy, tangy, spiced.", "$5", ["new"]],
      ["Rose Lassi", "Creamy & floral.", "$6", ["best"]],
      ["Aam Panna", "Raw mango cooler.", "$5", ["new"]],
      ["Nimbu Pani", "Classic lime soda.", "$4", []],
    ],
  },
  {
    id: "hot",
    name: "Hot Drinks & Milkshakes",
    emoji: "☕",
    note: "Warm up or thicken up.",
    items: [
      ["Masala Chai", "Brewed strong & spiced.", "$4", []],
      ["Filter Coffee", "South-Indian style.", "$4", []],
      ["Oreo Milkshake", "Thick & loaded.", "$7", ["best"]],
      ["Mango Milkshake", "Seasonal favourite.", "$7", []],
    ],
  },
  {
    id: "combos",
    name: "Combos",
    emoji: "🍱",
    note: "Mix, match & save. Built for sharing.",
    items: [
      ["Puchka Party Box", "24 assorted puchkas + 2 waters.", "$22", ["best", "viral"]],
      ["Roll + Drink Combo", "Any kathi roll + a summer drink.", "$13", []],
      ["Fusion Sampler", "6 fusion puchkas, all flavours.", "$16", ["viral"]],
      ["Street Feast For 2", "Puchkas + vada pav + momos + drinks.", "$32", ["best"]],
    ],
  },
];

const TAG_STYLE: Record<string, { label: string; variant: string }> = {
  best: { label: "★ Best Seller", variant: "yellow" },
  viral: { label: "🔥 Viral", variant: "red" },
  new: { label: "New", variant: "mint" },
};

export default function MenuPage() {
  const [active, setActive] = useState("trad");
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
      let cur = MENU[0].id;
      for (const c of MENU) {
        const el = document.getElementById("cat-" + c.id);
        if (el && el.getBoundingClientRect().top < 180) cur = c.id;
      }
      setActive(cur);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const chip = railRef.current?.querySelector(`[data-c="${active}"]`);
    if (chip) chip.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

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
            {MENU.map((c) => (
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
          {MENU.map((cat) => (
            <section key={cat.id} id={"cat-" + cat.id} style={{ marginBottom: 56, scrollMarginTop: 140 }}>
              <div className="flex center wrap-gap" style={{ gap: 14, marginBottom: 8 }}>
                <span style={{ fontSize: 34 }}>{cat.emoji}</span>
                <h2 className="display" style={{ fontSize: "clamp(1.7rem, 4.5vw, 2.6rem)" }}>{cat.name}</h2>
              </div>
              <p style={{ fontWeight: 500, opacity: 0.75, marginBottom: 22, fontFamily: "var(--mono)", fontSize: "0.86rem" }}>{cat.note}</p>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(228px, 1fr))", gridAutoRows: "1fr" }}>
                {cat.items.map(([name, desc, price, tags]) => (
                  <div
                    key={name}
                    className="card card--lift"
                    style={{ overflow: "hidden", height: "100%", display: "flex", flexDirection: "column", background: tags.includes("viral") ? "var(--cream)" : "var(--white)" }}
                  >
                    <div style={{ position: "relative" }}>
                      <Ph label="photo" ratio="4 / 3" style={{ border: "none", borderBottom: "var(--border)", borderRadius: 0, minHeight: 0 }} />
                      {tags.length > 0 && (
                        <div className="flex" style={{ position: "absolute", top: 9, left: 9, gap: 5, flexWrap: "wrap", maxWidth: "88%" }}>
                          {tags.map((t) => (
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
                              {TAG_STYLE[t].label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ padding: "14px 15px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
                      <div className="flex" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                        <h3 style={{ fontSize: "1.08rem", lineHeight: 1.05 }}>{name}</h3>
                        <span className="display" style={{ fontSize: "1.12rem", color: "var(--red)", flexShrink: 0 }}>{price}</span>
                      </div>
                      <p className="clamp-2" style={{ fontSize: "0.85rem", fontWeight: 500, opacity: 0.8, minHeight: "2.4em" }}>{desc}</p>
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
