import { FormError } from "@foundry/console/form-error";
import { confirmAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { errorText } from "../../lib/error-copy";
import { changeStageFn } from "../../lib/inquiries/inquiries.fns";
import { LOST_REASONS, type LostReason, type Stage } from "../../lib/inquiries/stages";
import { LOST_LABEL } from "./labels";

export function LostForm({ id, from, done }: { id: string; from: Stage; done: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState<LostReason | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason) return setError("Pick a reason.");
    setError(null);
    setPending(true);
    try {
      await confirmAction(() => changeStageFn({ data: { id, from, to: "lost", lostReason: reason } }), "Marked as lost", () => router.invalidate(), errorText);
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
        <Label>Lost reason</Label>
        <Select value={reason} onValueChange={(v) => setReason(v as LostReason)}>
          <SelectTrigger aria-label="Lost reason">
            <SelectValue placeholder="Choose a reason" />
          </SelectTrigger>
          <SelectContent>
            {LOST_REASONS.map((r) => (
              <SelectItem key={r} value={r}>
                {LOST_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <FormError error={error} />
      <Button type="submit" variant="destructive" disabled={pending}>
        Mark as lost
      </Button>
    </form>
  );
}
