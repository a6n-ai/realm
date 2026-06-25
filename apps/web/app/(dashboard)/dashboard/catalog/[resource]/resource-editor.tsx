"use client";

import { Loader2Icon, PencilIcon, PlusIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  RESOURCES, emptyForm, rowToForm, slug, type FieldDef, type ResourceDef,
} from "../resource-config";
import { reactivateItem, retireItem, saveItem, type ResourceKey } from "../actions";

type Row = Record<string, unknown> & { publicId: string };
type Options = Record<string, { value: string; label: string }[]>;

function FieldControl({
  f, def, form, options, isNew,
}: {
  f: FieldDef;
  def: ResourceDef;
  form: ReturnType<typeof useForm<Record<string, unknown>>>;
  options: Options;
  isNew: boolean;
}) {
  const opts = f.optionsSource ? (options[f.key] ?? []) : (f.options ?? []).map((o) => ({ value: o, label: f.optionLabels?.[o] ?? o }));
  const keyFrozen = f.readOnlyOnEdit && !isNew;

  return (
    <FormField
      control={form.control}
      name={f.key}
      render={({ field }) => (
        <FormItem className="grid gap-1.5">
          <FormLabel>
            {f.label}
            {f.optional ? <span className="text-muted-foreground font-normal"> optional</span> : null}
          </FormLabel>
          {f.type === "select" ? (
            <Select value={(field.value as string) ?? ""} onValueChange={field.onChange}>
              <FormControl><SelectTrigger><SelectValue placeholder={`Select ${f.label.toLowerCase()}`} /></SelectTrigger></FormControl>
              <SelectContent>{opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          ) : f.type === "multiselect" ? (
            <div className="flex flex-wrap gap-2">
              {opts.map((o) => {
                const arr = (field.value as string[]) ?? [];
                const on = arr.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => field.onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors active:scale-[0.97]",
                      on ? "border-primary/30 bg-primary/12 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          ) : f.type === "csv" ? (
            <FormControl>
              <Input
                value={((field.value as string[]) ?? []).join(", ")}
                onChange={(e) => field.onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="comma, separated, values"
              />
            </FormControl>
          ) : f.type === "boolean" ? (
            <FormControl><Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} /></FormControl>
          ) : f.type === "date" ? (
            <FormControl><Input type="date" value={(field.value as string) ?? ""} onChange={field.onChange} /></FormControl>
          ) : (
            <div className="flex items-center gap-1.5">
              {f.unit === "$" ? <span className="text-muted-foreground text-sm">$</span> : null}
              <FormControl>
                <Input
                  className={f.type === "number" ? "nums" : undefined}
                  type={f.type === "number" ? "number" : "text"}
                  disabled={keyFrozen}
                  value={(field.value as string) ?? ""}
                  onChange={field.onChange}
                />
              </FormControl>
              {f.unit && f.unit !== "$" ? <span className="text-muted-foreground text-sm">{f.unit}</span> : null}
            </div>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function EditorSheet({
  resource, def, options, editing, onClose,
}: {
  resource: string;
  def: ResourceDef;
  options: Options;
  editing: { id: string; row: Row | null } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const isNew = editing?.id === "__new__";
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(def.schema),
    defaultValues: editing?.row ? rowToForm(def, editing.row) : emptyForm(def),
  });

  // On create, keep `key` mirrored to slug(name) until the user unlocks it manually.
  const [keyManual, setKeyManual] = useState(false);
  const nameVal = form.watch("name");
  useEffect(() => {
    if (isNew && def.keyed && !keyManual) form.setValue("key", slug(String(nameVal ?? "")));
  }, [isNew, def.keyed, keyManual, nameVal, form]);

  async function onSubmit(values: Record<string, unknown>) {
    try {
      await saveItem(resource as ResourceKey, isNew ? null : editing!.id, values);
      onClose();
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (/key|unique|duplicate/i.test(msg)) form.setError("key", { message: "That key is already taken" });
      form.setError("root", { message: msg });
    }
  }

  const submitting = form.formState.isSubmitting;
  const keyField = def.fields.find((f) => f.key === "key");

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-border/70 border-b px-5 py-4">
          <SheetTitle>{isNew ? `New ${def.singular}` : `Edit ${def.singular}`}</SheetTitle>
          <SheetDescription>Typed fields — values are validated before saving.</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="grid flex-1 gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2">
              {def.fields.map((f) => (
                <div key={f.key} className={f.type === "multiselect" || f.type === "csv" ? "sm:col-span-2" : undefined}>
                  <FieldControl f={f} def={def} form={form} options={options} isNew={isNew} />
                  {f.key === "key" && isNew && keyField?.readOnlyOnEdit && !keyManual ? (
                    <button type="button" className="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1 text-xs" onClick={() => setKeyManual(true)}>
                      <PencilIcon className="size-3" /> Edit key
                    </button>
                  ) : null}
                </div>
              ))}
              {form.formState.errors.root ? (
                <p className="text-destructive sm:col-span-2 text-sm" role="alert">{form.formState.errors.root.message as string}</p>
              ) : null}
            </div>
            <SheetFooter className="border-border/70 flex-row justify-end gap-2 border-t">
              <SheetClose asChild><Button type="button" variant="outline" disabled={submitting}>Cancel</Button></SheetClose>
              <Button type="submit" disabled={submitting} className="active:scale-[0.98]">
                {submitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {submitting ? "Saving…" : "Save"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

export function ResourceEditor({
  resource, rows, dynamicOptions,
}: {
  resource: string;
  rows: Row[];
  dynamicOptions: Options;
}) {
  const def = RESOURCES[resource];
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string; row: Row | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const primary = def.fields[0].key;
  const secondary = def.fields.find((f) => f.type === "select");

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
  };

  return (
    <div className="space-y-4">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button onClick={() => setEditing({ id: "__new__", row: null })}>
        <PlusIcon className="size-4" /> Add {def.singular}
      </Button>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.publicId} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{String(row[primary] ?? row.publicId)}</span>
              {secondary && row[secondary.key] != null ? (
                <Badge variant="secondary">{secondary.optionLabels?.[String(row[secondary.key])] ?? String(row[secondary.key])}</Badge>
              ) : null}
              {row.active === false ? <Badge variant="outline">retired</Badge> : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing({ id: row.publicId, row })}>Edit</Button>
              {row.active === false ? (
                <Button size="sm" variant="outline" onClick={() => act(() => reactivateItem(resource as ResourceKey, row.publicId))}>Reactivate</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => act(() => retireItem(resource as ResourceKey, row.publicId))}>Retire</Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <EditorSheet
          key={editing.id}
          resource={resource}
          def={def}
          options={dynamicOptions}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
