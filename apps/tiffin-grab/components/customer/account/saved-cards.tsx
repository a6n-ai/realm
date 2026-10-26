"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCardIcon, Trash2Icon } from "lucide-react";
import { Button, EmptyState, ListGroup, IconButton, Notice, Pill, Sheet } from "@/components/customer/kit";
import { removeSavedCard } from "@/app/(customer)/me/account/card-actions";
import { SettingsBlock } from "./settings-block";
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
    <SettingsBlock title="Payment methods" footer="Cards you pay with are saved here for renewals." card={false}>
      <ListGroup>
        {cards.map((c) => (
          <div key={c.paymentMethodId} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#5856D6] text-white">
                <CreditCardIcon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[15px] font-semibold">
                  <span>{brandName(c.brand)} •••• {c.last4 ?? "????"}</span>
                  {c.isDefault && <Pill tone="ok" size="sm">Default</Pill>}
                </p>
                <p className="text-[13px] text-[var(--muted-foreground)]">Expires {expiry(c)}</p>
              </div>
            </div>
            <IconButton aria-label={`Remove ${brandName(c.brand)} ending ${c.last4 ?? ""}`} onClick={() => { setError(null); setRemoving(c); }}>
              <Trash2Icon className="size-4" />
            </IconButton>
          </div>
        ))}
      </ListGroup>
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
    </SettingsBlock>
  );
}
