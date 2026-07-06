"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@realm/ui/button";
import { Collapsible, CollapsibleContent } from "@realm/ui/collapsible";
import { Input } from "@realm/ui/input";
import { Textarea } from "@realm/ui/textarea";
import { cn } from "@realm/ui/cn";
import { logActivity } from "../actions";
import type { ActivityType } from "@/lib/services/inquiries.service";

type Field = "outcome" | "followup" | "amount" | "note";

const FIELDS: Record<ActivityType, Field[]> = {
  call: ["outcome", "followup", "note"],
  whatsapp: ["outcome", "followup", "note"],
  email: ["outcome", "followup", "note"],
  quote_sent: ["amount", "note"],
  payment_link_sent: ["amount", "note"],
  sample_sent: ["note"],
  visit: ["followup", "note"],
  callback: ["followup", "note"],
  note: ["note"],
};

const CHIPS: { type: ActivityType; label: string }[] = [
  { type: "call", label: "Call" },
  { type: "whatsapp", label: "WhatsApp" },
  { type: "email", label: "Email" },
  { type: "quote_sent", label: "Quote" },
  { type: "sample_sent", label: "Sample" },
  { type: "payment_link_sent", label: "Payment link" },
  { type: "visit", label: "Visit" },
  { type: "callback", label: "Callback" },
  { type: "note", label: "Note" },
];

const LABEL: Record<ActivityType, string> = Object.fromEntries(
  CHIPS.map((c) => [c.type, c.label]),
) as Record<ActivityType, string>;

// Derive the app currency's symbol from Intl so the amount field never hardcodes ₹.
function currencySymbol(currency: string): string {
  const parts = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
  }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? currency;
}

export function ActivityComposer({
  inquiryId,
  currency,
  defaultOpen,
}: {
  inquiryId: string;
  currency: string;
  defaultOpen?: ActivityType;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [active, setActive] = useState<ActivityType | null>(defaultOpen ?? null);
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [followup, setFollowup] = useState("");
  const [amount, setAmount] = useState("");

  const symbol = currencySymbol(currency);
  const fields = active ? FIELDS[active] : [];
  // For visit/callback the follow-up date IS the scheduled date.
  const followupLabel = active === "visit" || active === "callback" ? "Date" : "Next follow-up";

  function reset() {
    setOutcome("");
    setNote("");
    setFollowup("");
    setAmount("");
  }

  function select(type: ActivityType) {
    setActive((prev) => (prev === type ? null : type));
    reset();
  }

  function submit() {
    if (!active) return;
    const type = active;
    start(async () => {
      await logActivity(inquiryId, {
        type,
        outcome: fields.includes("outcome") && outcome.trim() ? outcome.trim() : undefined,
        note: note.trim() || undefined,
        nextFollowUpAt: fields.includes("followup") && followup ? new Date(followup).getTime() : undefined,
        // Amount is entered in major units; store as minor units. Currency is the app's, set server-side.
        amount: fields.includes("amount") && amount ? Math.round(parseFloat(amount) * 100) : undefined,
      });
      reset();
      setActive(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-x-visible">
        {CHIPS.map((c) => {
          const isActive = active === c.type;
          return (
            <button
              key={c.type}
              type="button"
              aria-pressed={isActive}
              onClick={() => select(c.type)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]",
                isActive
                  ? "border-primary/30 bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <Collapsible open={active !== null}>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          {active ? (
            <div className="grid gap-3 pt-1">
              {fields.includes("amount") ? (
                <div className="grid gap-1.5">
                  <label className="text-muted-foreground text-sm">Amount</label>
                  <div className="relative w-full sm:w-48">
                    <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm">
                      {symbol}
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="pl-8 tabular-nums"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              {fields.includes("outcome") ? (
                <div className="grid gap-1.5">
                  <label className="text-muted-foreground text-sm">Outcome</label>
                  <Input
                    className="w-full sm:w-72"
                    placeholder="Outcome (optional)"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                  />
                </div>
              ) : null}

              {fields.includes("followup") ? (
                <div className="grid gap-1.5">
                  <label className="text-muted-foreground text-sm">{followupLabel}</label>
                  <Input
                    type="date"
                    className="w-full sm:w-48"
                    value={followup}
                    onChange={(e) => setFollowup(e.target.value)}
                  />
                </div>
              ) : null}

              {fields.includes("note") ? (
                <Textarea
                  placeholder="Note (optional)…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              ) : null}

              <Button disabled={pending} onClick={submit} className="w-full sm:w-fit">
                Log {LABEL[active]}
              </Button>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
