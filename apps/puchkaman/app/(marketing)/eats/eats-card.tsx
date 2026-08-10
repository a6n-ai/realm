"use client";

import Link from "next/link";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { CloverColorSwatch } from "@/components/products/clover-color-swatch";
import { ProductImage } from "@/components/products/product-image";
import { TAG_STYLE } from "@/lib/menu-categories";
import type { EatsItem } from "./eats-filters";

const TAG_BG: Record<string, { bg: string; fg: string }> = {
  viral: { bg: "var(--green)", fg: "#fff" },
  new: { bg: "var(--mint)", fg: "#fff" },
};

export function EatsCard({
  item,
  orderingEnabled,
}: {
  item: EatsItem;
  orderingEnabled: boolean;
}) {
  const tagStyle = (t: string) => TAG_BG[t] ?? { bg: "var(--yellow)", fg: "var(--ink-deep)" };

  return (
    <div
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
              className="pill eats-card__badge"
              style={{
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
              className="pill eats-card__badge"
              style={{ background: tagStyle(t).bg, color: tagStyle(t).fg }}
            >
              {TAG_STYLE[t]?.label ?? t}
            </span>
          ))}
        </div>
        {/* The Indian veg/non-veg mark, top-right so it never collides with the
            badge stack. Only drawn for a classified item — an absent mark reads
            as "not stated", which is the truth, where a green dot would be a
            dietary claim nobody made. */}
        {item.veg !== null ? (
          <span
            className="eats-card__veg"
            title={item.veg ? "Vegetarian" : "Non-vegetarian"}
            aria-label={item.veg ? "Vegetarian" : "Non-vegetarian"}
            role="img"
            style={{ borderColor: item.veg ? "var(--mint)" : "var(--red)" }}
          >
            <span style={{ background: item.veg ? "var(--mint)" : "var(--red)" }} />
          </span>
        ) : null}
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
            <Link href={`/eats/${item.publicId}`} className="clamp-2" style={{ minWidth: 0 }}>
              {item.name}
            </Link>
          </h3>
          <span
            className="display"
            style={{ fontSize: "1.12rem", color: "var(--green)", flexShrink: 0, lineHeight: 1.15 }}
          >
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
                groups={item.modifierGroups}
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
  );
}
