"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verifyPinAction } from "./actions";

export function LockForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await verifyPinAction(pin);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    if (res.forcePassword) {
      router.push("/login");
      return;
    }
    setError("Incorrect PIN. Try again.");
    setPin("");
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        className="text-center text-2xl tracking-[0.5em]"
        aria-label="PIN"
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={pending || pin.length !== 4}>
        Unlock
      </Button>
      <button
        type="button"
        className="text-muted-foreground text-sm underline"
        onClick={() => signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })}
      >
        Sign in with password instead
      </button>
    </form>
  );
}
