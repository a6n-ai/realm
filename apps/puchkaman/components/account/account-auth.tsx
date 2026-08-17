"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn } from "@/components/brutal/shared";
import { authClient, signIn } from "@/lib/auth/client";
import { landingPathFor } from "@/lib/auth/landing";
import { useResendCooldown } from "@/lib/auth/use-resend-cooldown";

type Step = "email" | "details" | "code";

const FIELD: React.CSSProperties = {
  width: "100%",
  border: "var(--border)",
  padding: "14px 16px",
  fontSize: "1rem",
  margin: "8px 0 16px",
  background: "var(--white)",
};

/**
 * Public sign-in / create-account.
 *
 * Sign-in is strict: better-auth only mails a code to an address that already
 * has an account (see `disableSignUp` in lib/auth). So this asks the server
 * whether the address is known BEFORE requesting a code — a stranger gets the
 * create-account fields rather than an email that never arrives.
 */
export function AccountAuth({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, startCooldown] = useResendCooldown(30);

  async function lookup(body: { email: string; name?: string; phone?: string }) {
    const res = await fetch("/api/account/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { detail?: string } | null;
      throw new Error(detail?.detail ?? "Something went wrong. Try again.");
    }
    return (await res.json()) as { known: boolean; created: boolean };
  }

  async function sendCode(target: string) {
    const { error: err } = await authClient.emailOtp.sendVerificationOtp({
      email: target,
      type: "sign-in",
    });
    if (err) throw new Error(err.status === 429 ? "Too many codes requested. Try again in a minute." : "Could not send the code. Try again.");
    startCooldown();
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { known } = await lookup({ email });
      if (!known) {
        setStep("details");
        return;
      }
      await sendCode(email);
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await lookup({ email, name, phone: phone || undefined });
      await sendCode(email);
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await signIn.emailOtp({ email, otp: code });
    setBusy(false);
    if (result?.error) {
      setError("That code is not valid. Check it, or send a new one.");
      setCode("");
      return;
    }
    const role = (result?.data?.user as { role?: string } | undefined)?.role;
    router.push(landingPathFor(role, callbackUrl));
    router.refresh();
  }

  async function resend() {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await sendCode(email);
      setNotice("New code sent.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const messages = (
    <>
      {error && (
        <p role="alert" style={{ color: "var(--red)", marginBottom: 16 }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" style={{ color: "var(--green)", marginBottom: 16 }}>
          {notice}
        </p>
      )}
    </>
  );

  if (step === "email") {
    return (
      <form onSubmit={submitEmail}>
        <label className="mono" htmlFor="account-email" style={{ fontSize: "0.8rem" }}>
          Email
        </label>
        <input
          id="account-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={FIELD}
        />
        {messages}
        <Btn type="submit" variant="ink" block disabled={busy || !email}>
          {busy ? "Checking…" : "Continue"}
        </Btn>
        <p className="mono" style={{ fontSize: "0.75rem", marginTop: 16, opacity: 0.75 }}>
          New here? Enter your email and we&apos;ll set up your account on the next step.
        </p>
      </form>
    );
  }

  if (step === "details") {
    return (
      <form onSubmit={submitDetails}>
        <p style={{ marginBottom: 16 }}>
          No account for <strong>{email}</strong>{" "}
          yet — let&apos;s create one.
        </p>
        <label className="mono" htmlFor="account-name" style={{ fontSize: "0.8rem" }}>
          Full name
        </label>
        <input
          id="account-name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={FIELD}
        />
        <label className="mono" htmlFor="account-phone" style={{ fontSize: "0.8rem" }}>
          Phone (optional)
        </label>
        <input
          id="account-phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={FIELD}
        />
        {messages}
        <Btn type="submit" variant="ink" block disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create account"}
        </Btn>
        <Btn
          variant="cream"
          block
          onClick={() => {
            setStep("email");
            setError(null);
          }}
        >
          Use a different email
        </Btn>
      </form>
    );
  }

  return (
    <form onSubmit={verify}>
      <p style={{ marginBottom: 16 }}>
        We emailed a 6-digit code to <strong>{email}</strong>.
      </p>
      <label className="mono" htmlFor="account-code" style={{ fontSize: "0.8rem" }}>
        Code
      </label>
      <input
        id="account-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        style={{ ...FIELD, fontSize: "1.4rem", letterSpacing: "0.4em" }}
      />
      {messages}
      <Btn type="submit" variant="ink" block disabled={busy || code.length < 6}>
        {busy ? "Signing in…" : "Sign in"}
      </Btn>
      <Btn variant="cream" block onClick={resend} disabled={busy || cooldown > 0}>
        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </Btn>
      <Btn
        variant="white"
        block
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
          setNotice(null);
        }}
      >
        Use a different email
      </Btn>
    </form>
  );
}
