"use client";

import * as React from "react";
import { AlertCircleIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Alert, AlertDescription } from "@/components/reui/alert";

export function SaveStep({
  count,
  saving,
  error,
  onBack,
  onSave,
}: {
  count: number;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = React.useState("");
  const trimmed = name.trim();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed && !saving) onSave(trimmed);
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="group-name" className="text-sm font-medium">Group name</label>
        <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Brampton big spenders" className="max-w-sm" autoFocus />
      </div>
      <p className="text-muted-foreground text-sm">{count} {count === 1 ? "customer" : "customers"} will be saved in this group.</p>
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={saving}>Back</Button>
        <Button type="submit" disabled={!trimmed || saving}>{saving ? "Saving…" : error ? "Retry save" : "Save group"}</Button>
      </div>
    </form>
  );
}
