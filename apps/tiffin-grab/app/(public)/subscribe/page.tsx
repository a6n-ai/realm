import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { Wizard } from "@/components/wizard/wizard";

// Reads the live catalog — render per request, don't prerender at build.
export const dynamic = "force-dynamic";

export default async function SubscribePage() {
  const catalog = await loadCatalogSnapshot();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Build your tiffin subscription</h1>
      <p className="mt-1.5 text-sm text-muted-foreground text-pretty">Four quick steps to your weekly plan — fresh meals, delivered on your schedule.</p>
      <div className="mt-8">
        <Wizard catalog={toClientCatalog(catalog)} />
      </div>
    </main>
  );
}
