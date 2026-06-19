"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMyContact } from "./actions";

export function AccountForm({ phone, email }: { phone: string; email: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ phone, email });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      try {
        await updateMyContact({ phone: form.phone, email: form.email });
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update");
      }
    });
  };

  return (
    <div className="grid max-w-md gap-3">
      <div><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
      <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-600">Saved.</p> : null}
      <Button onClick={submit} disabled={pending} className="w-fit">Save changes</Button>
    </div>
  );
}
