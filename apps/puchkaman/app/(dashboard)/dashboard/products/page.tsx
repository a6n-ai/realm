import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";
import { SkeletonRows } from "@/components/admin/skeleton-rows";
import { ProductsTable } from "./products-table";

export const dynamic = "force-dynamic";

async function ProductsData() {
  const rows = await productsService.listAll();
  const products = rows.map((r) => ({ ...r, price: Number(r.price) }));
  return <ProductsTable products={products} />;
}

export default async function ProductsPage() {
  await requireAdmin();

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <p className="kicker" style={{ opacity: 0.55, marginBottom: 4 }}>
          Catalog
        </p>
        <h1 className="display" style={{ fontSize: "1.8rem" }}>
          Products
        </h1>
        <p style={{ opacity: 0.7, fontWeight: 500, marginTop: 4 }}>Manage what shows on the public menu.</p>
      </div>
      <Suspense fallback={<SkeletonRows />}>
        <ProductsData />
      </Suspense>
    </div>
  );
}
