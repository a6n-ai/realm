"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "./api-fetch";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foundry/ui/select";

const CONSENT_SOURCES = [
  { value: "purchase", label: "Existing customers (purchase)" },
  { value: "express_optin", label: "Express opt-in" },
  { value: "event_signup", label: "Event signup" },
  { value: "import_other", label: "Other" },
] as const;

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) ? n : undefined;
};

/**
 * Snapshot the same min-order/min-spend segment used on the campaign
 * audience builder into a static contact list. A snapshot, not a live
 * filter — a customer who crosses the threshold later needs Resync.
 */
interface SegmentValue {
  minOrderCount?: number;
  minTotalSpend?: number;
  lastOrderAfter?: number;
  requireVerifiedPhone?: boolean;
}

export function ContactListFromSegment({ requiresVerifiedPhone }: { requiresVerifiedPhone: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [consentSource, setConsentSource] = useState<string>("purchase");
  const [consentNote, setConsentNote] = useState("");
  const [segment, setSegment] = useState<SegmentValue>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return toast.error("Name the list");

    setBusy(true);
    try {
      const res = await apiFetch<{ imported: number }>("/api/notifications/contact-lists/from-segment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          consentSource,
          consentAt: Date.now(),
          consentNote: consentNote || undefined,
          segment,
        }),
      });
      toast.success(`Created list with ${res.imported} customers`);
      router.refresh();
      setName("");
      setSegment({});
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="segListName">List name</Label>
          <Input id="segListName" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>How was consent obtained?</Label>
          <Select value={consentSource} onValueChange={setConsentSource}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONSENT_SOURCES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="segConsentNote">Consent note</Label>
        <Input id="segConsentNote" value={consentNote} onChange={(e) => setConsentNote(e.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="segMinOrders">Min orders</Label>
          <Input
            id="segMinOrders"
            inputMode="numeric"
            placeholder="any"
            onChange={(e) => setSegment((s) => ({ ...s, minOrderCount: num(e.target.value) }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="segMinSpend">Min total spend</Label>
          <Input
            id="segMinSpend"
            inputMode="decimal"
            placeholder="any"
            onChange={(e) => setSegment((s) => ({ ...s, minTotalSpend: num(e.target.value) }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="segOrderedSince">Ordered since</Label>
          <Input
            id="segOrderedSince"
            type="date"
            onChange={(e) =>
              setSegment((s) => ({
                ...s,
                lastOrderAfter: e.target.value ? new Date(e.target.value).getTime() : undefined,
              }))
            }
          />
        </div>
      </div>

      {requiresVerifiedPhone && (
        <label className="flex items-start gap-2 text-sm">
          <Switch
            checked={segment.requireVerifiedPhone ?? true}
            onCheckedChange={(c) => setSegment((s) => ({ ...s, requireVerifiedPhone: c }))}
          />
          <span>Only verified phone numbers</span>
        </label>
      )}

      <Button onClick={submit} disabled={busy}>
        {busy ? "Creating…" : "Create list"}
      </Button>
    </div>
  );
}
