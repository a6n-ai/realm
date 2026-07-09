import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { Wizard } from "@/components/wizard/wizard";

// Reads the live catalog — render per request, don't prerender at build.
export const dynamic = "force-dynamic";

export default async function SubscribePage() {
  const catalog = await loadCatalogSnapshot();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Build your tiffin subscription</h1>
      <p className="mt-1 text-sm text-muted-foreground">Four quick steps to your weekly plan.</p>
      <div className="mt-8">
        <Wizard catalog={toClientCatalog(catalog)} />
      </div>
    </main>
  );
}
