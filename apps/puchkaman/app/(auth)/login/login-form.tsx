"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient, signIn } from "@/lib/auth/client";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

const otpEmailSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
});
const otpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

type Mode = "password" | "email-otp";

function Logo() {
  return (
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
  );
}

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("password");

  return (
    <div className="hero-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ width: "100%", maxWidth: 400, padding: "clamp(28px,4vw,40px)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Logo />
          <Link href="/" className="btn btn--sm btn--white" style={{ flexShrink: 0 }}>
            Home
          </Link>
        </div>

        <p className="kicker" style={{ opacity: 0.6, marginBottom: 4 }}>
          Admin
        </p>
        <h1 className="display" style={{ fontSize: "1.7rem", marginBottom: 26 }}>
          Sign in to the menu
        </h1>

        {mode === "password" ? (
          <PasswordPanel onUseEmailOtp={() => setMode("email-otp")} />
        ) : (
          <EmailOtpPanel onUsePassword={() => setMode("password")} />
        )}
      </div>
    </div>
  );
}

function PasswordPanel({ onUseEmailOtp }: { onUseEmailOtp: () => void }) {
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: "grid", gap: 18 }}>
      <div className={`field ${errors.email ? "field--err" : ""}`}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" className="input" {...register("email")} />
        {errors.email && <span className="err-msg">{errors.email.message}</span>}
      </div>

      <div className={`field ${errors.password ? "field--err" : ""}`}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <label htmlFor="password">Password</label>
          <Link href="/forgot-password" className="kicker" style={{ fontSize: "0.78rem", opacity: 0.7 }}>
            Forgot password?
          </Link>
        </div>
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

      <button type="button" onClick={onUseEmailOtp} className="btn btn--white btn--block">
        Email me a sign-in code instead
      </button>
    </form>
  );
}

// Passwordless sign-in: email a 6-digit code, then sign in with it. Never
// reveals whether an address exists — the flow advances to the code step
// regardless of the send result.
function EmailOtpPanel({ onUsePassword }: { onUsePassword: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailForm = useForm<z.infer<typeof otpEmailSchema>>({
    resolver: zodResolver(otpEmailSchema),
    defaultValues: { email: "" },
  });
  const codeForm = useForm<z.infer<typeof otpCodeSchema>>({
    resolver: zodResolver(otpCodeSchema),
    defaultValues: { code: "" },
  });

  async function sendCode(values: z.infer<typeof otpEmailSchema>) {
    setError(null);
    setBusy(true);
    await authClient.emailOtp.sendVerificationOtp({ email: values.email, type: "sign-in" });
    setBusy(false);
    setEmail(values.email);
    setStep("code");
  }

  async function verify(values: z.infer<typeof otpCodeSchema>) {
    setError(null);
    setBusy(true);
    const result = await signIn.emailOtp({ email, otp: values.code });
    setBusy(false);
    if (result?.error) {
      setError("Invalid or expired code");
      return;
    }
    router.push(params.get("callbackUrl") ?? "/dashboard");
    router.refresh();
  }

  if (step === "email") {
    return (
      <form onSubmit={emailForm.handleSubmit(sendCode)} noValidate style={{ display: "grid", gap: 18 }}>
        <div className={`field ${emailForm.formState.errors.email ? "field--err" : ""}`}>
          <label htmlFor="otp-email">Email</label>
          <input id="otp-email" type="email" autoComplete="email" className="input" {...emailForm.register("email")} />
          {emailForm.formState.errors.email && <span className="err-msg">{emailForm.formState.errors.email.message}</span>}
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
          {busy ? "Sending…" : "Email me a code"}
        </button>

        <button type="button" onClick={onUsePassword} className="btn btn--white btn--block">
          Sign in with a password instead
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={codeForm.handleSubmit(verify)} noValidate style={{ display: "grid", gap: 18 }}>
      <p className="kicker" style={{ opacity: 0.7 }}>
        We emailed a code to {email}
      </p>

      <div className={`field ${codeForm.formState.errors.code ? "field--err" : ""}`}>
        <label htmlFor="otp-code">Verification code</label>
        <input
          id="otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="input"
          {...codeForm.register("code")}
        />
        {codeForm.formState.errors.code && <span className="err-msg">{codeForm.formState.errors.code.message}</span>}
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

      <button
        type="button"
        onClick={() => {
          setStep("email");
          setError(null);
        }}
        className="btn btn--white btn--block"
      >
        Use a different email
      </button>
    </form>
  );
}
