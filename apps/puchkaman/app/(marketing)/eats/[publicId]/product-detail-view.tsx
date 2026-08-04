"use client";

import Link from "next/link";
import { useState } from "react";
import type { FileDetail } from "@realm/storage/model";
import { Btn, Pill } from "@/components/brutal/shared";
import { useCart } from "@/components/cart/cart-provider";
import { ModifierPicker } from "@/components/order/modifier-picker";
import { ProductImage } from "@/components/products/product-image";
import { money } from "@/lib/cart/types";
import { PUBLIC_ORDERING_UNAVAILABLE_MESSAGE } from "@/lib/clover/public-ordering-copy";
import {
  defaultSelection,
  modifierExtraPrice,
  selectedModifiersOf,
  unsatisfiedGroups,
  type PublicModifierGroup,
} from "@/lib/orders/modifier-types";
import { TAG_STYLE } from "@/lib/menu-categories";

export function ProductDetailView({
  product,
  modifierGroups,
  orderable,
}: {
  product: {
    publicId: string;
    name: string;
    description: string | null;
    price: number;
    image: FileDetail | null;
    tags: string[];
    category: string;
  };
  modifierGroups: PublicModifierGroup[];
  orderable: boolean;
}) {
  const { addItem, openDrawer } = useCart();
  const [selected, setSelected] = useState<string[]>(() => defaultSelection(modifierGroups));
  const [added, setAdded] = useState(false);

  const missing = unsatisfiedGroups(modifierGroups, selected);
  const unitPrice = product.price + modifierExtraPrice(modifierGroups, selected);
  const blocked = missing.length > 0;

  function add() {
    if (!orderable || blocked) return;
    addItem({
      productPublicId: product.publicId,
      name: product.name,
      price: product.price,
      category: product.category,
      modifiers: selectedModifiersOf(modifierGroups, selected),
    });
    setAdded(true);
    openDrawer();
  }

  return (
    <section className="section-pad" style={{ background: "var(--page-bg)" }}>
      <div className="wrap" style={{ maxWidth: 860 }}>
        <p style={{ marginBottom: 16, fontWeight: 700 }}>
          <Link href="/eats">← Back to menu</Link>
        </p>

        <div className="product-detail-grid" style={{ display: "grid", gap: 22 }}>
          <div className="card" style={{ overflow: "hidden", background: "var(--white)" }}>
            <ProductImage image={product.image} name={product.name} />
          </div>

          <div>
            <h1 className="display" style={{ fontSize: "clamp(1.8rem,4vw,2.4rem)", margin: 0 }}>
              {product.name}
            </h1>
            <p style={{ fontSize: "1.35rem", fontWeight: 800, margin: "10px 0 0" }}>
              {money(product.price)}
            </p>

            {product.tags.length ? (
              <div className="flex wrap-gap" style={{ gap: 6, marginTop: 12 }}>
                {product.tags.map((tag) => (
                  <Pill
                    key={tag}
                    // TAG_STYLE types variant as a plain string; Pill takes a union.
                    variant={(TAG_STYLE[tag]?.variant ?? "") as "green" | "yellow" | "mint" | ""}
                  >
                    {TAG_STYLE[tag]?.label ?? tag}
                  </Pill>
                ))}
              </div>
            ) : null}

            {product.description ? (
              <p style={{ marginTop: 14, fontWeight: 500, lineHeight: 1.55 }}>
                {product.description}
              </p>
            ) : null}

            {orderable ? (
              <div style={{ marginTop: 22, display: "grid", gap: 18 }}>
                <ModifierPicker
                  groups={modifierGroups}
                  selected={selected}
                  onChange={(next) => {
                    setSelected(next);
                    setAdded(false);
                  }}
                  idPrefix={`detail-${product.publicId}`}
                />

                {blocked ? (
                  <p role="status" style={{ margin: 0, fontWeight: 700, fontSize: "0.88rem" }}>
                    Still to choose: {missing.map((g) => g.name).join(", ")}
                  </p>
                ) : null}

                <Btn variant={added ? "yellow" : "green"} size="lg" block disabled={blocked} onClick={add}>
                  {added ? "Added ✓" : `Add to cart · ${money(unitPrice)}`}
                </Btn>
              </div>
            ) : (
              <p
                className="card"
                style={{
                  marginTop: 22,
                  padding: "14px 16px",
                  background: "var(--cream)",
                  fontWeight: 700,
                }}
              >
                {PUBLIC_ORDERING_UNAVAILABLE_MESSAGE}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
