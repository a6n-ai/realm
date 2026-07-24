"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { passwordSchema } from "@realm/commons";
import { setInitialPassword } from "./actions";

const schema = z
  .object({
    newPassword: passwordSchema,
    confirm: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

export function SetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { newPassword: "", confirm: "" } });

  async function onSubmit(values: FormValues) {
    setError(null);
    setBusy(true);
    const result = await setInitialPassword(values.newPassword);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    // Bust the cached /dashboard RSC first (it was cached as a redirect BACK here
    // while password_set was false), THEN navigate so the gate re-runs and passes.
    router.refresh();
    router.push("/dashboard");
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
          Set your password
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: "grid", gap: 18 }}>
          <div className={`field ${errors.newPassword ? "field--err" : ""}`}>
            <label htmlFor="newPassword">New password</label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              className="input"
              {...register("newPassword")}
            />
            {errors.newPassword && <span className="err-msg">{errors.newPassword.message}</span>}
          </div>

          <div className={`field ${errors.confirm ? "field--err" : ""}`}>
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              className="input"
              {...register("confirm")}
            />
            {errors.confirm && <span className="err-msg">{errors.confirm.message}</span>}
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
            {busy ? "Saving…" : "Save password"}
          </button>
        </form>
      </div>
    </div>
  );
}
