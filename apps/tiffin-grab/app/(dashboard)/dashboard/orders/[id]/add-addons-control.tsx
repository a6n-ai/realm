"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDebouncedAsync } from "@/lib/hooks/use-debounced-async";
import { toast } from "sonner";
import { formatMoney } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { makeImageThumbnail, ResponsiveDialog } from "@/components/ds";
import type { AddonQuote } from "@/lib/services/order-addons.service";
import { addOrderAddonsAction, quoteOrderAddonsAction } from "./actions";

export type AddonOption = { key: string; name: string; pricePerTiffin: number; maxQty: number; existingQty: number };
export type AddonMethodOption = { id: string; label: string; requireProof: boolean };

/** Staff add add-ons to a running plan and record the payment they already hold for them. */
type QuoteResult = { quote: AddonQuote | null; error: string | null };

export function AddAddonsControl({
  orderId,
  options,
  methods,
  defaultMethodId,
  currency,
}: {
  orderId: string;
  options: AddonOption[];
  methods: AddonMethodOption[];
  defaultMethodId: string | null;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  // No guess when the plan's own method is not on offer (a migrated plan, a method since turned
  // off): the first one in the list would be recorded as how the customer paid.
  const defaultMethod = methods.find((m) => m.id === defaultMethodId)?.id ?? (methods.length === 1 ? methods[0]!.id : "");
  const [methodId, setMethodId] = useState(defaultMethod);
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Bumped to ask for a fresh quote for the same inputs (after a refused save or a failed quote).
  const [refresh, setRefresh] = useState(0);
  // Bumped on close so a quote from an earlier open never matches the new session's inputs.
  const [session, setSession] = useState(0);
  const [saving, startSaving] = useTransition();

  const selections = options.filter((o) => (qty[o.key] ?? 0) > 0).map((o) => ({ key: o.key, qty: qty[o.key]! }));
  const selectionKey = JSON.stringify(selections);
  const method = methods.find((m) => m.id === methodId);
  // Card: nothing is recorded now; the customer pays a link and the add-ons apply when it settles.
  const isCard = methodId === "stripe";
  const inputKey = `${session}|${methodId}|${selectionKey}|${refresh}`;
  const priced = open && selections.length > 0 && !!methodId;
  // Keyed by the inputs it answers, so a result for older inputs is never shown or saved.
  const found = useDebouncedAsync<QuoteResult>(priced ? inputKey : null, async () => {
    const res = await quoteOrderAddonsAction(orderId, selections, methodId);
    return "error" in res ? { quote: null, error: res.error } : { quote: res.quote, error: null };
  }, 250, { quote: null, error: "Could not get a price. Try again." });
  const current = priced && found.key === inputKey ? found.value : null;
  const quote = current?.quote ?? null;
  const error = formError ?? current?.error ?? null;

  function step(option: AddonOption, delta: number) {
    const room = option.maxQty - option.existingQty;
    setFormError(null);
    setQty((q) => ({ ...q, [option.key]: Math.min(room, Math.max(0, (q[option.key] ?? 0) + delta)) }));
  }

  function close() {
    setOpen(false);
    setQty({});
    setMethodId(defaultMethod);
    setReference("");
    setFile(null);
    setFormError(null);
    setRefresh(0);
    setSession((n) => n + 1);
  }

  function save() {
    if (!quote) return;
    const shown = quote.amountDue;
    setFormError(null);
    if (!isCard && method?.requireProof && !file) {
      setFormError("Attach the payment screenshot");
      return;
    }
    startSaving(async () => {
      const form = new FormData();
      form.set("selections", selectionKey);
      form.set("method", methodId);
      form.set("expected_amount_due", shown.toFixed(2));
      if (!isCard && reference.trim()) form.set("reference", reference.trim());
      if (!isCard && file) {
        const thumb = await makeImageThumbnail(file);
        form.set("proof", file);
        form.set("proof_thumb", thumb, thumb.name);
      }
      const res = await addOrderAddonsAction(orderId, form);
      if ("error" in res) {
        setFormError(res.error);
        setRefresh((n) => n + 1);
        return;
      }
      toast.success(isCard ? "Payment link created" : "Add-ons added and payment recorded");
      close();
      router.refresh();
    });
  }

  if (options.length === 0 || methods.length === 0) return null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      trigger={
        <Button size="sm" variant="outline">
          Add-ons
        </Button>
      }
      title="Add add-ons to this plan"
      description="Charged for the tiffins not yet past cutoff. A tiffin already past cutoff that the kitchen has not packed yet will also get the extras, at no charge."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !quote}>
            {saving ? "Saving…" : isCard ? "Create payment link" : quote ? `Add and record ${formatMoney(quote.amountDue, currency)}` : "Add add-ons"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <ul className="divide-y rounded-md border">
          {options.map((o) => {
            const room = o.maxQty - o.existingQty;
            const value = qty[o.key] ?? 0;
            return (
              <li key={o.key} className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <p className="font-medium">{o.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatMoney(o.pricePerTiffin, currency)} per tiffin
                    {o.existingQty > 0 ? ` · ${o.existingQty} on the plan` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" aria-label={`Fewer ${o.name}`} disabled={value === 0} onClick={() => step(o, -1)}>
                    −
                  </Button>
                  <span className="w-6 text-center tabular-nums" aria-label={`${o.name} quantity`}>
                    {value}
                  </span>
                  <Button size="sm" variant="outline" aria-label={`More ${o.name}`} disabled={value >= room} onClick={() => step(o, 1)}>
                    +
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <label className="grid gap-1">
          <span className="font-medium">Paid by</span>
          <select className="w-full rounded-md border px-3 py-2" value={methodId} onChange={(e) => { setFormError(null); setMethodId(e.target.value); }}>
            {!defaultMethod && (
              <option value="" disabled>
                Choose how the customer paid
              </option>
            )}
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {!isCard && (
          <>
            <label className="grid gap-1">
              <span className="font-medium">Payment screenshot{method?.requireProof ? "" : " (optional)"}</span>
              <input type="file" accept="image/*" onChange={(e) => { setFormError(null); setFile(e.target.files?.[0] ?? null); }} />
            </label>

            <label className="grid gap-1">
              <span className="font-medium">Reference (optional)</span>
              <input className="w-full rounded-md border px-3 py-2" value={reference} onChange={(e) => { setFormError(null); setReference(e.target.value); }} />
            </label>
          </>
        )}

        {quote && (
          <dl className="space-y-1 rounded-md border bg-muted/30 p-3 tabular-nums" aria-label="Add-on quote">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tiffins left to change</dt>
              <dd>{quote.openTiffins}</dd>
            </div>
            {quote.lines.map((l) => (
              <div key={l.label} className="flex justify-between gap-3">
                <dt>{l.label}</dt>
                <dd>{formatMoney(l.amount, currency)}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax</dt>
              <dd>{formatMoney(quote.taxTotal, currency)}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>To collect</dt>
              <dd>{formatMoney(quote.amountDue, currency)}</dd>
            </div>
            <div className="text-muted-foreground flex justify-between">
              <dt>New plan total</dt>
              <dd>{formatMoney(quote.newTotal, currency)}</dd>
            </div>
          </dl>
        )}
        {!methodId && selections.length > 0 && <p className="text-muted-foreground">Choose how the customer paid to see the amount.</p>}
        {error && (
          <p className="text-destructive" role="alert">
            {error}
            {!formError && selections.length > 0 && (
              <Button size="sm" variant="outline" className="ml-2" onClick={() => setRefresh((n) => n + 1)}>
                Try again
              </Button>
            )}
          </p>
        )}
      </div>
    </ResponsiveDialog>
  );
}
