import { runAction } from "@foundry/console/run-action";
import { Input } from "@foundry/ui/input";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { fromDateInput, toDateInput } from "../../lib/dates";
import { errorText } from "../../lib/error-copy";
import { setFollowUpFn } from "../../lib/inquiries/inquiries.fns";
import { FollowUpBadge } from "./follow-up-badge";

// The date is the control: click to edit, saves on pick. The server cannot clear a follow-up, so there is no Clear.
export function FollowUpControl({ id, at, overdue, editable }: { id: string; at: number | null; overdue: boolean; editable: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const current = at === null ? "" : toDateInput(at);
  if (!editable) return <FollowUpBadge at={at} overdue={overdue} />;

  function change(value: string) {
    const next = fromDateInput(value);
    if (next === null || value === current) return;
    void runAction(() => setFollowUpFn({ data: { id, at: next } }), "Follow-up saved", async () => { setEditing(false); await router.invalidate(); }, errorText);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        aria-label="Next follow-up"
        type="date"
        defaultValue={current}
        className="-my-1.5 -ml-2 h-8 w-40"
        onChange={(e) => change(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditing(false); }}
      />
    );
  }
  return (
    <button type="button" aria-label="Edit next follow-up" onClick={() => setEditing(true)} className="-my-1.5 -ml-2 inline-flex h-8 items-center rounded-md px-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50">
      <FollowUpBadge at={at} overdue={overdue} />
    </button>
  );
}
