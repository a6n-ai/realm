"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { updateUsernameAction } from "@/app/(customer)/me/account/actions";

// The rule is checked on the server (one source of truth in @foundry/friends);
// this form only shows what the server says.
export function UsernameForm({ current }: { current: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await updateUsernameAction(value);
      setError(res.error ?? null);
      if (res.error) return;
      toast.success("Username saved.");
      router.refresh();
    });

  return (
    <form
      className="grid max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Label htmlFor="username">Username</Label>
      <div className="flex gap-2">
        <Input
          id="username"
          autoComplete="username"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          placeholder="e.g. priya.sharma"
        />
        <Button type="submit" disabled={pending || value.trim() === current}>
          Save
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">Friends find you by this. 3–30 letters, numbers, _ or .</p>
      )}
    </form>
  );
}
