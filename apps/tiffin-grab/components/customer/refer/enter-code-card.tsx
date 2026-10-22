"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field } from "@/components/customer/kit";
import { enterReferralCode } from "@/app/(customer)/me/refer/actions";

export function EnterCodeCard() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setError("Enter the code your friend shared.");
    setError(null);
    start(async () => {
      const res = await enterReferralCode(code);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  };

  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div>
          <h2 className="c-h2">Got a code from a friend?</h2>
          <p className="c-caption mt-1">Add it before your first order is paid and you both earn coins.</p>
        </div>
        <Field
          label="Friend's code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. ABCD2345"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={error ?? undefined}
        />
        <Button type="submit" variant="primary" pending={pending} className="self-start">
          Add code
        </Button>
      </form>
    </Card>
  );
}
