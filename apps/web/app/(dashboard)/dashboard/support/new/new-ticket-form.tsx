"use client";

import { Loader2Icon, SendIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTicket } from "../actions";

export type TicketCategoryValue = "order" | "billing" | "catering" | "general";

const CATEGORY_LABEL: Record<TicketCategoryValue, string> = {
  order: "An order",
  billing: "Billing or payment",
  catering: "Catering",
  general: "Something else",
};

const NO_ORDER = "__none__";

type OrderOption = { value: string; label: string };

export function NewTicketForm({
  categories,
  orders,
  defaultOrderId,
  defaultCategory,
}: {
  categories: TicketCategoryValue[];
  orders: OrderOption[];
  defaultOrderId?: string;
  defaultCategory: TicketCategoryValue;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategoryValue>(defaultCategory);
  const [orderId, setOrderId] = useState(defaultOrderId ?? NO_ORDER);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    if (!trimmedSubject) return setError("Please add a short subject.");
    if (!trimmedBody) return setError("Please describe what's going on.");
    setError(null);
    start(async () => {
      try {
        await createTicket({
          subject: trimmedSubject,
          category,
          body: trimmedBody,
          orderPublicId: orderId !== NO_ORDER ? orderId : undefined,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the ticket. Please try again.");
      }
    });
  }

  return (
    <div className="grid max-w-xl gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="ticket-subject">Subject</Label>
        <Input
          id="ticket-subject"
          autoFocus
          placeholder="e.g. Tiffin didn't arrive today"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ticket-category">What's this about?</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as TicketCategoryValue)}>
          <SelectTrigger id="ticket-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {orders.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="ticket-order">
            Related order <span className="text-muted-foreground font-normal">optional</span>
          </Label>
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger id="ticket-order" className="w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ORDER}>None</SelectItem>
              {orders.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="ticket-body">Message</Label>
        <Textarea
          id="ticket-body"
          rows={5}
          placeholder="Tell us what happened, and anything that helps us sort it out…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}

      <div className="flex items-center gap-2">
        <Button onClick={submit} disabled={pending} className="active:scale-[0.98]">
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
          {pending ? "Sending…" : "Submit ticket"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.push("/dashboard/support")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
