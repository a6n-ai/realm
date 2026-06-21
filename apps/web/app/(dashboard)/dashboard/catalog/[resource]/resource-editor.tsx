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

type Row = Record<string, unknown> & { publicId: string };
const rowId = (row: Row) => row.publicId;

function FieldInputs({
  def,
  values,
  setValues,
  dynamicOptions,
}: {
  def: ResourceDef;
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  dynamicOptions: Record<string, { value: string; label: string }[]>;
}) {
  const set = (k: string, v: string) => setValues({ ...values, [k]: v });
  const toggleMulti = (k: string, value: string, checked: boolean) => {
    const cur = (values[k] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const next = checked ? [...new Set([...cur, value])] : cur.filter((x) => x !== value);
    set(k, next.join(", "));
  };
  const optionsFor = (f: ResourceDef["fields"][number]) =>
    f.optionsSource ? (dynamicOptions[f.key] ?? []) : (f.options ?? []).map((o) => ({ value: o, label: f.optionLabels?.[o] ?? o }));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {def.fields.map((f) => {
        const selected = new Set((values[f.key] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
        return (
          <div key={f.key}>
            <Label>{f.label}{f.optional ? <span className="text-muted-foreground"> (optional)</span> : null}</Label>
            {f.type === "select" ? (
              <Select value={values[f.key] ?? ""} onValueChange={(v) => set(f.key, v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{optionsFor(f).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            ) : f.type === "multiselect" ? (
              <div className="mt-1 flex flex-wrap gap-2">
                {optionsFor(f).map((o) => (
                  <label key={o.value} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
                    <input type="checkbox" checked={selected.has(o.value)} onChange={(e) => toggleMulti(f.key, o.value, e.target.checked)} />
                    {o.label}
                  </label>
                ))}
              </div>
            ) : f.type === "date" ? (
              <Input type="date" value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <div className="flex items-center gap-1">
                {f.unit === "$" ? <span className="text-muted-foreground text-sm">$</span> : null}
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
                {f.unit && f.unit !== "$" ? <span className="text-muted-foreground text-sm">{f.unit}</span> : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ResourceEditor({ resource, def, rows, dynamicOptions }: { resource: string; def: ResourceDef; rows: Row[]; dynamicOptions: Record<string, { value: string; label: string }[]> }) {
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
          <FieldInputs def={def} values={values} setValues={setValues} dynamicOptions={dynamicOptions} />
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
