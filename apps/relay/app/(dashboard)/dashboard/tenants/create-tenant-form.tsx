"use client";

import { useState } from "react";
import { createTenantAction } from "./actions";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";

export function CreateTenantForm() {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex max-w-xl flex-col gap-3"
      action={async (formData) => {
        setError(null);
        const result = await createTenantAction(formData);
        if (result.error) setError(result.error);
        setSecret(result.secret ?? null);
      }}
    >
      <div className="flex gap-2">
        <Input name="name" required placeholder="Name (e.g. Realm)" />
        <Input name="slug" required placeholder="slug (e.g. realm-dev)" />
        <Button type="submit">Create</Button>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {secret ? (
        <p className="text-sm">
          Copy this key now; it is not shown again: <code className="break-all">{secret}</code>
        </p>
      ) : null}
    </form>
  );
}
