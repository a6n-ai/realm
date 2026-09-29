"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { ResponsiveDialog } from "@/components/ds";
import { startAllMigratedAction } from "./actions";

/** Switch-over day: start every WordPress plan still waiting, in one go. */
export function StartMigratedDialog({ waiting }: { waiting: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [failed, setFailed] = useState<{ deploymentId: string; error: string }[]>([]);
  const [pending, start] = useTransition();

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFailed([]);
      }}
      trigger={<Button size="sm" variant="outline">Start WordPress plans ({waiting})</Button>}
      title="Start every WordPress plan"
      description={`Schedules the tiffins left for all ${waiting} waiting WordPress customers from this date (a customer WordPress hasn't started yet keeps their own later start). Stop WordPress deliveries the same day.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            disabled={pending || !fromDate}
            onClick={() =>
              start(async () => {
                const res = await startAllMigratedAction(fromDate);
                if ("error" in res) {
                  toast.error(res.error);
                  return;
                }
                setFailed(res.failed);
                toast.success(`Started ${res.started} plan${res.started === 1 ? "" : "s"}${res.failed.length ? `, ${res.failed.length} need attention` : ""}`);
                if (!res.failed.length) setOpen(false);
                router.refresh();
              })
            }
          >
            {pending ? "Starting…" : "Start all"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input type="date" aria-label="Switch-over date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        {failed.length > 0 && (
          <ul className="text-destructive m-0 max-h-48 list-none space-y-1 overflow-auto p-0 text-sm">
            {failed.map((f) => (
              <li key={f.deploymentId}>
                {f.deploymentId}: {f.error}
              </li>
            ))}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  );
}
