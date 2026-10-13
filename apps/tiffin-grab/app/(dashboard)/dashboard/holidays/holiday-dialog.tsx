"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import { ResponsiveDialog } from "@/components/ds";
import type { HolidayPreview } from "@/lib/services/holidays.service";
import { createHolidayAction } from "./actions";

export function HolidayDialog({ today, organizations }: { today: string; organizations: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [notify, setNotify] = useState(true);
  const [preview, setPreview] = useState<HolidayPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const single = organizations.length === 1;
  const organizationId = single ? organizations[0].id : orgId;

  const submit = (confirmToday: boolean) =>
    start(async () => {
      setError(null);
      const res = await createHolidayAction({ organizationId, date, name, notify, confirmToday });
      if ("error" in res) return setError(res.error);
      if (res.preview) return setPreview(res.preview);
      setOpen(false);
      toast.success(res.message ?? "Holiday saved");
      router.refresh();
    });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) { setDate(""); setName(""); setOrgId(""); setNotify(true); setPreview(null); setError(null); }
      }}
      trigger={<Button size="sm">Declare holiday</Button>}
      title="Declare a holiday"
      description="The kitchen is closed that day. Every delivery on it is paused at no cost to the customer and added back at the end of the plan."
      footer={
        organizations.length === 0 ? null : preview ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>Back</Button>
            <Button disabled={pending} onClick={() => submit(true)}>{pending ? "Saving…" : "Declare holiday anyway"}</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || !date || !name.trim() || !organizationId} onClick={() => submit(false)}>
              {pending ? "Saving…" : "Declare holiday"}
            </Button>
          </div>
        )
      }
    >
      {organizations.length === 0 ? (
        <p className="text-sm">You are not a member of any organization, so you cannot declare a holiday. Ask an admin to add you.</p>
      ) : preview ? (
        <div className="grid gap-2">
          <p className="text-sm">
            Today&apos;s kitchen is already running. {preview.affected} deliveries will be closed and added back at the end of their plans. {preview.onRoute} are already on a route and will be removed from it. {preview.delivered} already delivered stay as they are.
          </p>
          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="hol-date">Date</Label>
            <Input id="hol-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="hol-name">Name</Label>
            <Input id="hol-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali" />
          </div>
          {!single && (
            <div className="grid gap-2">
              <Label htmlFor="hol-org">Organization</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger id="hol-org" className="w-64"><SelectValue placeholder="Pick an organization" /></SelectTrigger>
                <SelectContent>
                  {organizations.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch id="hol-notify" checked={notify} onCheckedChange={setNotify} />
            <Label htmlFor="hol-notify">Notify customers</Label>
          </div>
          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        </div>
      )}
    </ResponsiveDialog>
  );
}
