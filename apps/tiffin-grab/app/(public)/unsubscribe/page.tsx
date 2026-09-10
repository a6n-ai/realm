import { Card } from "@foundry/ui/card";
import { applyUnsubscribe } from "@/app/api/unsubscribe/route";

// Reads the request URL and writes, so it can never be prerendered or cached.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ address?: string; token?: string }>;

export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const url = new URL("https://placeholder.invalid/unsubscribe");
  if (sp.address) url.searchParams.set("address", sp.address);
  if (sp.token) url.searchParams.set("token", sp.token);

  // Same handler as the API route. It is a no-op on a bad or missing token, and
  // the page below says the same thing either way — so this page cannot be used
  // to test whether an address is on the list.
  await applyUnsubscribe(url);

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-xl items-center px-4 py-16">
      <Card className="border-foreground w-full rounded-3xl border-[1.5px] p-8 text-center shadow-[8px_8px_0_var(--primary)]">
        <h1 className="text-2xl font-bold tracking-tight">You&apos;re unsubscribed</h1>
        <p className="mt-3 text-muted-foreground">
          You will no longer receive marketing email from TiffinGrab. It can take a few minutes for
          anything already on its way to stop.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          You will still get messages about orders you place — receipts, payment confirmations and
          delivery updates. Those aren&apos;t marketing, and we send them so you know what is happening
          with your own order.
        </p>
      </Card>
    </main>
  );
}
