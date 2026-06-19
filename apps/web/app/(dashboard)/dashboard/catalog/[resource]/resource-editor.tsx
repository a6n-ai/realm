"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  fieldsToPatch,
  rowToFields,
  type ResourceDef,
} from "../resource-config";
import { reactivateItem, retireItem, saveItem, type ResourceKey } from "../actions";

type Row = Record<string, unknown>;
const rowId = (row: Row) => String(row.id);

function FieldInputs({
  def,
  values,
  setValues,
}: {
  def: ResourceDef;
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
}) {
  const set = (k: string, v: string) => setValues({ ...values, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {def.fields.map((f) => (
        <div key={f.key}>
          <Label>{f.label}{f.optional ? <span className="text-muted-foreground"> (optional)</span> : null}</Label>
          {f.type === "select" ? (
            <Select value={values[f.key] ?? ""} onValueChange={(v) => set(f.key, v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{f.options!.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <Input
              type={f.type === "number" ? "number" : "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function ResourceEditor({ resource, def, rows }: { resource: string; def: ResourceDef; rows: Row[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });

  const startNew = () => {
    setEditingId("__new__");
    setValues(Object.fromEntries(def.fields.map((f) => [f.key, ""])));
  };
  const startEdit = (row: Row) => {
    setEditingId(rowId(row));
    setValues(rowToFields(def, row));
  };
  const save = () =>
    run(async () => {
      await saveItem(resource as ResourceKey, editingId === "__new__" ? null : editingId, fieldsToPatch(def, values));
      setEditingId(null);
    });

  return (
    <div className="space-y-4">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {editingId ? (
        <div className="grid gap-3 rounded-lg border p-4">
          <h2 className="font-medium">{editingId === "__new__" ? "New item" : "Edit item"}</h2>
          <FieldInputs def={def} values={values} setValues={setValues} />
          <div className="flex gap-2">
            <Button onClick={save} disabled={pending}>Save</Button>
            <Button variant="outline" onClick={() => setEditingId(null)} disabled={pending}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button onClick={startNew}>Add {def.label.toLowerCase()}</Button>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={rowId(row)} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{String(row[def.fields[0].key] ?? rowId(row))}</span>
              {row.active === false ? <Badge variant="outline">retired</Badge> : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => startEdit(row)} disabled={pending}>Edit</Button>
              {row.active === false ? (
                <Button size="sm" variant="outline" onClick={() => run(() => reactivateItem(resource as ResourceKey, rowId(row)))} disabled={pending}>Reactivate</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => run(() => retireItem(resource as ResourceKey, rowId(row)))} disabled={pending}>Retire</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
