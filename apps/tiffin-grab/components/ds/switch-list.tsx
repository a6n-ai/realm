"use client";

import { Fragment, type ReactNode } from "react";
import { SaveIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Card } from "@foundry/ui/card";
import { Separator } from "@foundry/ui/separator";
import { Switch } from "@foundry/ui/switch";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";

/** Save bar shared by the settings and roles editors: status on the left, Reset + Save on the right. */
export function SaveBar({
  status,
  dirty,
  pending,
  error,
  onReset,
  onSave,
}: {
  status: string;
  dirty: boolean;
  pending: boolean;
  error?: string;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{status}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        {dirty && (
          <Button variant="ghost" disabled={pending} onClick={onReset}>
            Reset
          </Button>
        )}
        <Button onClick={onSave} disabled={pending || !dirty} className="gap-2">
          <SaveIcon className="size-4" />
          Save
        </Button>
      </div>
    </div>
  );
}

export interface SwitchRow {
  id: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}

/** ReUI c-switch-6: one bordered list, name left, switch right, separators between rows. */
export function SwitchList({ rows }: { rows: SwitchRow[] }) {
  return (
    <Card className="p-0">
      <FieldGroup className="gap-0">
        {rows.map((r, i) => (
          <Fragment key={r.id}>
            {i > 0 && <Separator />}
            <Field data-disabled={r.disabled || undefined}>
              <FieldLabel className="justify-between px-4 py-3">
                <FieldContent>
                  <FieldTitle className="flex items-center gap-2">{r.icon}{r.label}</FieldTitle>
                  {r.hint && <FieldDescription className="text-xs tabular-nums">{r.hint}</FieldDescription>}
                </FieldContent>
                <Switch checked={r.checked} disabled={r.disabled} onCheckedChange={r.onChange} />
              </FieldLabel>
            </Field>
          </Fragment>
        ))}
      </FieldGroup>
    </Card>
  );
}
