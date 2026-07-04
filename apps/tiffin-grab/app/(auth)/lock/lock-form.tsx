"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";
import { Button } from "@realm/ui/button";
import { PinOtp } from "@/components/pin-otp";
import { verifyPinAction } from "./actions";

export function LockForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function verify(value: string) {
    setPending(true);
    setError(null);
    const res = await verifyPinAction(value);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    if (res.forcePassword) {
      await signOut({ fetchOptions: { onSuccess: () => router.push("/login") } });
      return;
    }
    setError("Incorrect PIN. Try again.");
    setPin("");
    setPending(false);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); verify(pin); }} className="flex flex-col items-center gap-3">
      <PinOtp
        value={pin}
        onChange={setPin}
        onComplete={verify}
        autoFocus
        disabled={pending}
        aria-label="PIN"
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={pending || pin.length !== 4} className="w-full">
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
