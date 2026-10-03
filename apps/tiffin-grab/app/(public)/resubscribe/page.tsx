import { Card } from "@foundry/ui/card";
import { ResubscribeForm } from "./resubscribe-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ address?: string; token?: string }>;

// A button, not an apply-on-load like /unsubscribe: mail scanners open every
// link in a message, and a GET that re-subscribed would undo an opt-out
// without the person ever choosing to.
export default async function ResubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const { address, token } = await searchParams;
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-xl items-center px-4 py-16">
      <Card className="border-foreground w-full rounded-3xl border-[1.5px] p-8 text-center shadow-[8px_8px_0_var(--primary)]">
        {address && token ? (
          <ResubscribeForm address={address} token={token} />
        ) : (
          <h1 className="text-2xl font-bold tracking-tight">This link is not valid</h1>
        )}
      </Card>
    </main>
  );
}
