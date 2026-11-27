import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { confirmAction } from "@foundry/console/run-action";
import { FormError } from "@foundry/console/form-error";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { fromDateInput, tomorrowInput } from "../../lib/dates";
import { errorText } from "../../lib/error-copy";
import { reopenFn } from "../../lib/inquiries/inquiries.fns";
import { OPEN_STAGES, type Stage } from "../../lib/inquiries/stages";
import { STAGE_LABEL } from "./labels";

export function ReopenForm({ id, done }: { id: string; done: () => void }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("contacted");
  const [followUp, setFollowUp] = useState(() => tomorrowInput());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const at = fromDateInput(followUp);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (at === null) return setError("Pick a follow-up date.");
    setError(null);
    setPending(true);
    try {
      await confirmAction(() => reopenFn({ data: { id, stage: stage as (typeof OPEN_STAGES)[number], nextFollowUpAt: at } }), "Inquiry reopened", () => router.invalidate(), errorText);
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label>Reopen at stage</Label>
        <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
          <SelectTrigger aria-label="Reopen at stage">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPEN_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="reopen-follow">Next follow-up</Label>
        <Input id="reopen-follow" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
      </div>
      <FormError error={error} />
      <Button type="submit" disabled={pending}>
        Reopen inquiry
      </Button>
    </form>
  );
}
