import { FormError } from "@foundry/console/form-error";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { errorText } from "../../lib/error-copy";
import { setManagerFn } from "../../lib/team/team.fns";
import { ResponsiveDialog } from "../responsive-dialog";

const NONE = "none";

export function ReportsToDialog({
  member,
  people,
  onClose,
}: {
  member: { id: string; name: string; managerId: string | null };
  people: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(member.managerId ?? NONE);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const options = people.filter((p) => p.id !== member.id);
  const nameOf = (v: string) => options.find((p) => p.id === v)?.name ?? "No manager";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await setManagerFn({ data: { id: member.id, managerId: value === NONE ? null : value } });
      if (!res.ok) {
        const text = errorText(new Error(res.code));
        toast.error(text);
        return setError(text);
      }
      toast.success(value === NONE ? `${member.name} has no manager` : `${member.name} reports to ${nameOf(value)}`);
      onClose();
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err));
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={`Reports to, ${member.name}`} description="Who this person reports to in the org chart.">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="reports-to">Manager</Label>
          <Select value={value} onValueChange={(v) => v && setValue(String(v))}>
            <SelectTrigger id="reports-to" aria-label="Manager">
              <SelectValue>{nameOf(value)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No manager</SelectItem>
              {options.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
