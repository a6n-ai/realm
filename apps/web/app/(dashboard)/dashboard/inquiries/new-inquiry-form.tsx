"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { createInquiry } from "./actions";

const SOURCES = ["website", "facebook", "google", "manual", "referral"] as const;

const EMPTY = { fullName: "", phone: "", email: "", source: "manual", notes: "" };

/**
 * Add-inquiry flow surfaced as a slide-over Sheet. The trigger is rendered by
 * the caller (the "Add inquiry" insight card) and passed in as children so the
 * card stays a pure presentational tile.
 */
export function AddInquirySheet({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
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
        setForm(EMPTY);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create inquiry");
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PlusIcon className="size-4" />
            New inquiry
          </SheetTitle>
          <SheetDescription>Capture a lead. It lands in the pipeline as “New”.</SheetDescription>
        </SheetHeader>

        <div className="grid flex-1 gap-4 overflow-y-auto px-4">
          <div className="grid gap-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">
              Email <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="source">Source</Label>
            <Select value={form.source} onValueChange={(v) => set({ source: v })}>
              <SelectTrigger id="source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button variant="outline" disabled={pending}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={submit} disabled={pending || !form.fullName || !form.phone}>
            {pending ? "Adding…" : "Add inquiry"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
