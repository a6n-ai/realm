"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createInquiry } from "./actions";

const SOURCES = ["website", "facebook", "google", "manual", "referral"] as const;

export function NewInquiryForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", source: "manual", notes: "" });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        await createInquiry({
          fullName: form.fullName,
          phone: form.phone,
          email: form.email || undefined,
          source: form.source,
          notes: form.notes || undefined,
        });
        setForm({ fullName: "", phone: "", email: "", source: "manual", notes: "" });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create inquiry");
      }
    });
  };

  return (
    <div className="grid max-w-xl gap-3 rounded-lg border p-4">
      <h2 className="font-medium">New inquiry</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="fullName">Full name</Label><Input id="fullName" value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} /></div>
        <div><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
        <div><Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label><Input id="email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></div>
        <div>
          <Label htmlFor="source">Source</Label>
          <Select value={form.source} onValueChange={(v) => set({ source: v })}>
            <SelectTrigger id="source"><SelectValue /></SelectTrigger>
            <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button onClick={submit} disabled={pending || !form.fullName || !form.phone} className="w-fit">Add inquiry</Button>
    </div>
  );
}
