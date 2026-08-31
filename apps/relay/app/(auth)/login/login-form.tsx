"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth/client";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Card, CardContent } from "@foundry/ui/card";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const result = await signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Sign in failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="p-6">
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <h1 className="text-xl font-semibold">Relay</h1>
          <p className="text-muted-foreground text-sm">Operator sign in</p>
          <Input name="email" type="email" required placeholder="Email" autoComplete="username" />
          <Input name="password" type="password" required placeholder="Password" autoComplete="current-password" />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
