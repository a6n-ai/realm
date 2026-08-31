"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveIcon, Trash2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { Textarea } from "@foundry/ui/textarea";
import { Skeleton } from "@foundry/ui/skeleton";
import type { PaymentConfig, PaymentMethodConfig, TaxLine } from "@foundry/payments";
import { savePaymentConfig } from "./actions";

export function PaymentsForm({
  initial,
  activeMethodId,
}: {
  initial: PaymentConfig;
  /** When set, only this method's settings are shown (one tab at a time). */
  activeMethodId: string;
}) {
  const router = useRouter();
  const [methods, setMethods] = useState<PaymentMethodConfig[]>(initial.methods);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const method = methods.find((m) => m.id === activeMethodId);

  const patch = (id: string, p: Partial<PaymentMethodConfig>) =>
    setMethods((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const removeMethod = (id: string) => {
    const next = methods.filter((m) => m.id !== id);
    setMethods(next);
    start(async () => {
      setError(null);
      try {
        await savePaymentConfig({
          methods: next,
          defaultMethodId:
            initial.defaultMethodId === id ? undefined : initial.defaultMethodId,
        });
        router.push(
          next[0] ? `/dashboard/settings/payments/${next[0].id}` : "/dashboard/settings/payments",
        );
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Remove failed");
        setMethods(methods);
      }
    });
  };

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await savePaymentConfig({
          methods,
          defaultMethodId: initial.defaultMethodId,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });

  if (!method) {
    return (
      <p className="text-muted-foreground text-sm">
        This payment method is not installed.{" "}
        <Link href="/dashboard/settings/payments" className="underline">
          Add a provider
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <MethodCard
        method={method}
        onPatch={(p) => patch(method.id, p)}
        onRemove={() => removeMethod(method.id)}
      />

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button onClick={save} disabled={pending} className="h-10 gap-2">
          <SaveIcon className="size-4" />
          Save {method.label}
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/settings/integrations">Manage plugins</Link>
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
    <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
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
          <Label className="text-muted-foreground text-xs">Customer-facing label</Label>
          <Input
            value={method.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-muted-foreground text-xs">
            Payee handle (e-Transfer email / phone)
          </Label>
          <Input
            value={method.payeeHandle ?? ""}
            placeholder="pay@yourbrand.ca"
            onChange={(e) => onPatch({ payeeHandle: e.target.value })}
            className="h-10"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground text-xs">Instructions shown to the customer</Label>
        <Textarea
          value={method.instructions ?? ""}
          placeholder="Send an Interac e-Transfer to the email above and include your order reference."
          onChange={(e) => onPatch({ instructions: e.target.value })}
          rows={2}
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          checked={method.requireProof ?? false}
          onCheckedChange={(v) => onPatch({ requireProof: v })}
        />
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
      <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        Taxes
      </p>
      {taxes.length === 0 && <p className="text-muted-foreground text-sm">No taxes on this method.</p>}
      {taxes.map((t, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg bg-background/80 p-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs">Name</Label>
            <Input
              value={t.name}
              placeholder="GST"
              onChange={(e) => patchLine(i, { name: e.target.value })}
              className="h-10 w-40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs">Rate %</Label>
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
            className="text-destructive hover:text-destructive h-10 w-10 p-0"
            onClick={() => removeLine(i)}
            aria-label="Remove tax line"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addLine}>
        Add tax
      </Button>
    </div>
  );
}

export function PaymentsFormSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
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
      <Skeleton className="h-10 w-48" />
    </div>
  );
}
