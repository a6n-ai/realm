"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "@/lib/auth/client";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: FormValues) {
    setError(null);
    setBusy(true);
    const result = await signIn.email({ email: values.email, password: values.password });
    setBusy(false);
    if (result?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push(params.get("callbackUrl") ?? "/dashboard");
    router.refresh();
  }

  return (
    <div className="hero-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ width: "100%", maxWidth: 400, padding: "clamp(28px,4vw,40px)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--red)",
              border: "3px solid var(--ink)",
              display: "grid",
              placeItems: "center",
              boxShadow: "3px 3px 0 var(--ink)",
              flexShrink: 0,
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--yellow)", border: "2px solid var(--ink)" }} />
          </span>
          <span className="display" style={{ fontSize: "1.4rem", letterSpacing: "-0.04em" }}>
            PUCHKAMAN
          </span>
        </div>

        <p className="kicker" style={{ opacity: 0.6, marginBottom: 4 }}>
          Admin
        </p>
        <h1 className="display" style={{ fontSize: "1.7rem", marginBottom: 26 }}>
          Sign in to the menu
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: "grid", gap: 18 }}>
          <div className={`field ${errors.email ? "field--err" : ""}`}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" className="input" {...register("email")} />
            {errors.email && <span className="err-msg">{errors.email.message}</span>}
          </div>

          <div className={`field ${errors.password ? "field--err" : ""}`}>
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" className="input" {...register("password")} />
            {errors.password && <span className="err-msg">{errors.password.message}</span>}
          </div>

          {error && (
            <p className="err-msg" role="alert" style={{ fontSize: "0.82rem" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn btn--red btn--block"
            style={busy ? { opacity: 0.7, pointerEvents: "none" } : undefined}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
