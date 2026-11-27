import { confirmAction } from "@foundry/console/run-action";
import { FormError } from "@foundry/console/form-error";
import { Button } from "@foundry/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Textarea } from "@foundry/ui/textarea";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { errorText } from "../../lib/error-copy";
import { addActivityFn } from "../../lib/inquiries/inquiries.fns";
import { ACTIVITY_TYPES } from "./labels";

type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

export function ActivityComposer({ id }: { id: string }) {
  const router = useRouter();
  const [type, setType] = useState<ActivityType>("note");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return setError("Write something first.");
    setError(null);
    setPending(true);
    try {
      await confirmAction(() => addActivityFn({ data: { id, type, note } }), "Activity added", () => router.invalidate(), errorText);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
        <SelectTrigger aria-label="Activity type" className="sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTIVITY_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea aria-label="Activity note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
      <FormError error={error} />
      <div>
        <Button type="submit" disabled={pending}>
          Add activity
        </Button>
      </div>
    </form>
  );
}
