"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCardIcon, Trash2Icon } from "lucide-react";
import { Button, Card, EmptyState, IconButton, Notice, Pill, Sheet } from "@/components/customer/kit";
import { removeSavedCard } from "@/app/(customer)/me/account/card-actions";
import { unwrapAction } from "@/lib/actions/unwrap";

export type SavedCardView = { paymentMethodId: string; brand: string | null; last4: string | null; expMonth: number; expYear: number; isDefault: boolean };

const brandName = (b: string | null) => (b ? b.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Card");
const expiry = (c: SavedCardView) => `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear % 100).padStart(2, "0")}`;

export function SavedCards({ cards }: { cards: SavedCardView[] }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<SavedCardView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!removing) return;
    setPending(true);
    setError(null);
    try {
      await unwrapAction(removeSavedCard(removing.paymentMethodId));
      setRemoving(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the card.");
    } finally {
      setPending(false);
    }
  }

  if (cards.length === 0) {
    return <EmptyState icon={<CreditCardIcon className="size-6" />} title="No saved cards" body="No saved cards. Cards you pay with are saved here for renewals." />;
  }

  return (
    <Card className="space-y-5 p-5 md:p-6">
      <header className="space-y-1">
        <h2 className="c-h2">Payment methods</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Cards you pay with are saved here for renewals.</p>
      </header>
      <ul className="space-y-3">
        {cards.map((c) => (
          <li key={c.paymentMethodId} className="flex items-center justify-between gap-3 rounded-2xl border bg-[var(--card)] p-4">
            <div className="flex min-w-0 items-center gap-3">
              <CreditCardIcon aria-hidden className="size-5 shrink-0 text-[var(--muted-foreground)]" />
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  <span>{brandName(c.brand)} •••• {c.last4 ?? "????"}</span>
                  {c.isDefault && <Pill tone="ok" size="sm">Default</Pill>}
                </p>
                <p className="text-sm text-[var(--muted-foreground)]">Expires {expiry(c)}</p>
              </div>
            </div>
            <IconButton aria-label={`Remove ${brandName(c.brand)} ending ${c.last4 ?? ""}`} onClick={() => { setError(null); setRemoving(c); }}>
              <Trash2Icon className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      <Sheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this card?"
        footer={<Button pill variant="danger" pending={pending} onClick={confirm}>Remove card</Button>}
      >
        <div className="space-y-3">
          <p className="text-sm">{removing ? `${brandName(removing.brand)} •••• ${removing.last4 ?? ""} will no longer be used for renewals.` : null}</p>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </Sheet>
    </Card>
  );
}
