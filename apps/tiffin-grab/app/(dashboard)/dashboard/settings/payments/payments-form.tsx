"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Switch } from "@realm/ui/switch";
import { Textarea } from "@realm/ui/textarea";
import { Skeleton } from "@realm/ui/skeleton";
import { cn } from "@realm/ui/cn";
import type { PaymentConfig, PaymentMethodConfig, TaxLine } from "@realm/payments";
import { savePaymentConfig } from "./actions";

// Methods an admin can add today. Each id maps to the app's payment_method enum. Online
// (Stripe) is intentionally absent until its adapter ships (P5).
const METHOD_TEMPLATES: { id: string; label: string }[] = [
  { id: "etransfer", label: "Interac e-Transfer" },
  { id: "cash", label: "Cash on delivery" },
  { id: "manual", label: "Manual / Other" },
];

function newMethod(id: string, label: string): PaymentMethodConfig {
  return { id, kind: "manual", enabled: false, label, taxes: [] };
}

export function PaymentsForm({ initial }: { initial: PaymentConfig }) {
  const router = useRouter();
  const [methods, setMethods] = useState<PaymentMethodConfig[]>(initial.methods);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const present = new Set(methods.map((m) => m.id));
  const addable = METHOD_TEMPLATES.filter((t) => !present.has(t.id));

  const patch = (id: string, p: Partial<PaymentMethodConfig>) =>
    setMethods((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const addMethod = (t: { id: string; label: string }) =>
    setMethods((ms) => [...ms, newMethod(t.id, t.label)]);

  const removeMethod = (id: string) => setMethods((ms) => ms.filter((m) => m.id !== id));

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await savePaymentConfig({ methods });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });

  return (
    <div className="space-y-5">
      {methods.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No payment methods yet — the app runs in simulated mode. Add one below to start
          collecting real payments.
        </p>
      )}

      {methods.map((m) => (
        <MethodCard
          key={m.id}
          method={m}
          onPatch={(p) => patch(m.id, p)}
          onRemove={() => removeMethod(m.id)}
        />
      ))}

      {addable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/60 bg-background/60 p-3">
          <span className="text-muted-foreground text-sm">Add a method:</span>
          {addable.map((t) => (
            <Button
              key={t.id}
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => addMethod(t)}
            >
              <PlusIcon className="size-3.5" />
              {t.label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={save} disabled={pending} className="h-10 gap-2">
          <SaveIcon className="size-4" />
          Save payment methods
        </Button>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    </div>
  );
}

function MethodCard({
  method,
  onPatch,
  onRemove,
}: {
  method: PaymentMethodConfig;
  onPatch: (p: Partial<PaymentMethodConfig>) => void;
  onRemove: () => void;
}) {
  const setTaxes = (taxes: TaxLine[]) => onPatch({ taxes });

  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Switch checked={method.enabled} onCheckedChange={(v) => onPatch({ enabled: v })} />
          <span className="font-semibold">{method.label}</span>
          <span className="text-muted-foreground text-xs uppercase tracking-wider">{method.id}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remove ${method.label}`}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Customer-facing label</Label>
          <Input value={method.label} onChange={(e) => onPatch({ label: e.target.value })} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Payee handle (e-Transfer email / phone)</Label>
          <Input
            value={method.payeeHandle ?? ""}
            placeholder="pay@yourbrand.ca"
            onChange={(e) => onPatch({ payeeHandle: e.target.value })}
            className="h-10"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Instructions shown to the customer</Label>
        <Textarea
          value={method.instructions ?? ""}
          placeholder="Send an Interac e-Transfer to the email above and include your order reference."
          onChange={(e) => onPatch({ instructions: e.target.value })}
          rows={2}
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={method.requireProof ?? false} onCheckedChange={(v) => onPatch({ requireProof: v })} />
        <span className="text-sm">Require a payment screenshot on claim</span>
      </div>

      <TaxEditor taxes={method.taxes} onChange={setTaxes} />
    </div>
  );
}

function TaxEditor({ taxes, onChange }: { taxes: TaxLine[]; onChange: (t: TaxLine[]) => void }) {
  const patchLine = (i: number, p: Partial<TaxLine>) =>
    onChange(taxes.map((t, idx) => (idx === i ? { ...t, ...p } : t)));
  const addLine = () => onChange([...taxes, { name: "", ratePct: 0 }]);
  const removeLine = (i: number) => onChange(taxes.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Taxes</p>
      {taxes.length === 0 && <p className="text-muted-foreground text-sm">No taxes on this method.</p>}
      {taxes.map((t, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg bg-background/80 p-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              value={t.name}
              placeholder="GST"
              onChange={(e) => patchLine(i, { name: e.target.value })}
              className="h-10 w-40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Rate %</Label>
            <Input
              type="number"
              value={t.ratePct}
              min={0}
              max={100}
              step="0.01"
              onChange={(e) => patchLine(i, { ratePct: Number(e.target.value) })}
              className="h-10 w-28 tabular-nums"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 text-destructive hover:text-destructive"
            onClick={() => removeLine(i)}
            aria-label="Remove tax line"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addLine}>
        <PlusIcon className="size-3.5" />
        Add tax
      </Button>
    </div>
  );
}

export function PaymentsFormSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-muted/30 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-11 rounded-full" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-48" />
        </div>
      ))}
      <Skeleton className="h-10 w-48" />
    </div>
  );
}
