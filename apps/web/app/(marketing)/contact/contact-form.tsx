"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebsiteInquiry } from "./actions";

export function ContactForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { waitlisted: boolean }>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", postalCode: "", message: "", company: "" });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        const res = await createWebsiteInquiry(form);
        setDone({ waitlisted: res.waitlisted });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };

  if (done) {
    return (
      <div className="card-glow rounded-lg border p-6">
        <h2 className="font-medium">Thanks — we got your message.</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {done.waitlisted
            ? "We don't serve your area just yet — you're on the waitlist and we'll reach out when we expand."
            : "Our team will be in touch shortly."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid max-w-lg gap-3">
      <div><Label htmlFor="fullName">Name</Label><Input id="fullName" value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} /></div>
      <div><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
      <div><Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label><Input id="email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></div>
      <div><Label htmlFor="postal">Postal code <span className="text-muted-foreground">(optional)</span></Label><Input id="postal" value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} /></div>
      <div>
        <Label htmlFor="message">Message</Label>
        <textarea
          id="message"
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
          value={form.message}
          onChange={(e) => set({ message: e.target.value })}
        />
      </div>
      {/* Honeypot: visually hidden, off the tab order; real users never fill it. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={form.company}
        onChange={(e) => set({ company: e.target.value })}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button onClick={submit} disabled={pending || !form.fullName || !form.phone} className="hover-lift group w-fit">Send message<Send className="icon-pop size-4" /></Button>
    </div>
  );
}
