import { CreateDialog } from "@foundry/console/create-dialog";
import { FormError } from "@foundry/console/form-error";
import { confirmAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { errorText } from "../../lib/error-copy";
import { addSubsourceFn, createSourceFn, renameSourceFn } from "../../lib/inquiries/sources.fns";

export type SourceDialogMode =
  | { kind: "create" }
  | { kind: "rename"; id: string; label: string }
  | { kind: "subsource"; sourceId: string; sourceLabel: string };

// Keys are lowercase letters, digits and underscores; derived from the label so nobody types one.
export const keyFor = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);

const COPY = {
  create: { trigger: "Add source", title: "Add source", success: "Source added", save: "Add source" },
  rename: { trigger: "Rename", title: "Rename source", success: "Source renamed", save: "Save name" },
  subsource: { trigger: "Add sub-source", title: "Add sub-source", success: "Sub-source added", save: "Add sub-source" },
} as const;

function Form({ mode, done }: { mode: SourceDialogMode; done: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState(mode.kind === "rename" ? mode.label : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const key = keyFor(label);
    if (!label.trim() || (mode.kind !== "rename" && !key)) return setError("Enter a name with letters or numbers.");
    setError(null);
    setPending(true);
    try {
      const action =
        mode.kind === "create"
          ? () => createSourceFn({ data: { key, label } })
          : mode.kind === "rename"
            ? () => renameSourceFn({ data: { id: mode.id, label } })
            : () => addSubsourceFn({ data: { sourceId: mode.sourceId, key, label } });
      await confirmAction(action, COPY[mode.kind].success, () => router.invalidate(), errorText);
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
        <Label htmlFor="src-label">Name</Label>
        <Input id="src-label" required value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <FormError error={error} />
      <Button type="submit" disabled={pending}>
        {COPY[mode.kind].save}
      </Button>
    </form>
  );
}

export function SourceDialog({ mode }: { mode: SourceDialogMode }) {
  const copy = COPY[mode.kind];
  return (
    <CreateDialog trigger={copy.trigger} title={mode.kind === "subsource" ? `${copy.title} to ${mode.sourceLabel}` : copy.title}>
      {(done) => <Form mode={mode} done={done} />}
    </CreateDialog>
  );
}
