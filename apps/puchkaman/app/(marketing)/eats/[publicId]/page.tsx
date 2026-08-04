import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { FileDetail } from "@realm/storage/model";
import { isPublicOrderingEnabled } from "@/lib/clover/public-ordering";
import { ordersService } from "@/lib/services/orders.service";
import { productsService } from "@/lib/services/products.service";
import { buildMetadata, breadcrumbJsonLd, jsonLdHtml } from "@/lib/seo";
import { ProductDetailView } from "./product-detail-view";

// Same reason as the menu index: no build-time database, so nothing is prerendered.
export const dynamic = "force-dynamic";

/**
 * Public product page. Deliberately reuses the menu's own queries rather than adding
 * a second definition of "orderable" — the two pages must never disagree about
 * whether something can be bought.
 */
async function getProduct(publicId: string) {
  const [rows, orderable, orderingEnabled] = await Promise.all([
    productsService.listForPublicMenu(),
    ordersService.listOrderableCatalog(),
    isPublicOrderingEnabled(),
  ]);

  const row = rows.find((r) => r.publicId === publicId);
  if (!row) return null;

  const orderableRow = orderable.find((o) => o.publicId === publicId);
  return {
    product: {
      publicId: row.publicId,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      image: (row.image as FileDetail | null) ?? null,
      tags: row.tags ?? [],
      category: row.category,
    },
    modifierGroups: orderableRow?.modifierGroups ?? [],
    orderable: orderingEnabled && Boolean(orderableRow),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const found = await getProduct(publicId);
  if (!found) {
    return buildMetadata({
      title: "Not found | Puchkaman",
      description: "That menu item is no longer available.",
      path: `/eats/${publicId}`,
      noIndex: true,
    });
  }
  return buildMetadata({
    title: `${found.product.name} | Puchkaman`,
    description:
      found.product.description ??
      `Order ${found.product.name} for pickup or delivery from Puchkaman in Scarborough.`,
    path: `/eats/${publicId}`,
  });
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const found = await getProduct(publicId);
  if (!found) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MenuItem",
    name: found.product.name,
    description: found.product.description ?? undefined,
    offers: {
      "@type": "Offer",
      price: found.product.price.toFixed(2),
      priceCurrency: "CAD",
      availability: found.orderable
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Menu", path: "/eats" },
              { name: found.product.name, path: `/eats/${publicId}` },
            ]),
          ),
        }}
      />
      <ProductDetailView
        product={found.product}
        modifierGroups={found.modifierGroups}
        orderable={found.orderable}
      />
    </>
  );
}
