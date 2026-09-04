"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";

export type SaveStoreLinkUrl = (url: string) => Promise<{ error?: string }>;

/**
 * Uber Eats and DoorDash are both "one URL, no API" plugins — this panel is
 * the shared shape between them (see @foundry/uber-eats, @foundry/doordash).
 * Extract to a package if a second app needs it; app-local for now.
 */
export function StoreLinkSettingsPanel({
  label,
  url,
  onSave,
}: {
  /** e.g. "Uber Eats store URL" */
  label: string;
  url: string;
  onSave: SaveStoreLinkUrl;
}) {
  const [value, setValue] = useState(url);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await onSave(value.trim());
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved");
    });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="store-link-url">{label}</Label>
        <Input
          id="store-link-url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <Button type="button" disabled={pending} onClick={save}>
        Save
      </Button>
    </div>
  );
}
