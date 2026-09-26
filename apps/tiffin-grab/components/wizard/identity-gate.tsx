"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { emailSchema } from "@foundry/commons";
import { authClient, signIn } from "@/lib/auth/client";
import { checkExistingAccount, createCheckoutAccount } from "@/app/(public)/subscribe/actions";
import { Button, Field, Label, Notice } from "@/components/customer/kit";
import { CodeOtp } from "@foundry/auth-ui";
import { emailDomainSuggestions } from "./email-domains";

// Step zero of /subscribe for signed-out visitors, drawn in the wizard's own
// language (question headline, kit Field, one hero CTA) so it reads as the
// first step rather than a separate form.
//
// Every order needs an owner who can sign in — the activate page only takes a
// payment screenshot from the signed-in owner — so there is no guest path. An
// existing email gets a sign-in code; a new one first gets an account (name +
// email) and then the same code. Everything reveals in place on one screen. A
// verified code signs them in and hands off to /me/renew, the signed-in wizard.
// See docs/superpowers/specs/2026-09-08-subscribe-identity-gate-design.md.
//
// Phases: "email" -> "name" (new email only) -> "otp" -> /me/renew. "staff" is a
// dead end: a staff email cannot order, so it is sent to the dashboard sign-in.
type Phase = "email" | "name" | "otp" | "staff";

const COPY: Record<Phase, { title: string; body: string }> = {
  email: { title: "Let's start with your email.", body: "We'll email you a code to sign in, or to set up your account if you're new." },
  name: { title: "Nice to meet you.", body: "Your orders, deliveries and payments will live in this account." },
  otp: { title: "Check your inbox.", body: "Enter the 6-digit code we just sent." },
  staff: { title: "That's a staff account.", body: "" },
};

export function IdentityGate() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field: "email" | "name" | "code" | "form"; message: string } | null>(null);
  const [resent, setResent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const suggestions = phase === "email" ? emailDomainSuggestions(email) : [];
  const reveal = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 } };

  function changeEmail() {
    setPhase("email");
    setCode("");
    setError(null);
    setResent(false);
    requestAnimationFrame(() => emailRef.current?.focus());
  }

  async function sendCode(to: string) {
    try {
      await authClient.emailOtp.sendVerificationOtp({ email: to, type: "sign-in" });
      setPhase("otp");
      return true;
    } catch {
      setError({ field: "form", message: "We couldn't send the code. Check the email and try again." });
      return false;
    }
  }

  async function submitEmail() {
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) return setError({ field: "email", message: "Enter a valid email, like you@gmail.com." });
    const clean = parsed.data;
    setEmail(clean);
    const { status } = await checkExistingAccount(clean);
    if (status === "staff") return setPhase("staff");
    if (status === "matched") {
      setIsNew(false);
      return void (await sendCode(clean));
    }
    setIsNew(true);
    setPhase("name");
  }

  async function submitName() {
    if (!fullName.trim()) return setError({ field: "name", message: "Enter your name as it should appear on deliveries." });
    const { status } = await createCheckoutAccount(email, fullName);
    if (status === "staff") return setPhase("staff");
    if (status === "invalid") return setError({ field: "form", message: "Check your name and email, then try again." });
    await sendCode(email);
  }

  async function verify(otp: string) {
    if (!/^\d{6}$/.test(otp)) return setError({ field: "code", message: "Enter all 6 digits." });
    const result = await signIn.emailOtp({ email, otp });
    if (result?.error) return setError({ field: "code", message: "That code is wrong or expired. Try again or resend it." });
    router.push("/me/renew");
    router.refresh();
  }

  // `otp` comes straight from CodeOtp's onComplete: the `code` state set in the
  // same tick isn't readable here yet.
  async function onSubmit(e?: FormEvent, otp: string = code) {
    e?.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      if (phase === "email") await submitEmail();
      else if (phase === "name") await submitName();
      else if (phase === "otp") await verify(otp);
    } catch {
      setError({ field: "form", message: "Something went wrong on our side. Try again." });
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    setError(null);
    setCode("");
    if (await sendCode(email)) setResent(true);
  }

  const lockedEmail = phase !== "email";
  const cta = phase === "email" ? "Continue" : phase === "name" ? "Send my code" : "Verify and continue";

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-md">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={phase} {...reveal} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
          <h2 className="c-h2">{COPY[phase].title}</h2>
          {COPY[phase].body ? <p className="c-body mt-1.5 text-pretty text-[var(--muted-foreground)]">{COPY[phase].body}</p> : null}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Field
            ref={emailRef}
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            readOnly={lockedEmail}
            onChange={(e) => setEmail(e.target.value)}
            error={error?.field === "email" ? error.message : undefined}
            className={lockedEmail ? "bg-[var(--muted)] text-[var(--muted-foreground)]" : undefined}
          />
          {lockedEmail ? (
            <button type="button" onClick={changeEmail} className="c-caption self-start py-1 font-semibold text-[var(--primary)] underline-offset-4 hover:underline">
              Use a different email
            </button>
          ) : null}
          {suggestions.length > 0 ? (
            <div role="group" aria-label="Suggested email addresses" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setEmail(s);
                    emailRef.current?.focus();
                  }}
                  className="min-h-11 shrink-0 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 text-[13px] font-semibold tabular-nums transition-transform duration-100 active:scale-[0.97]"
                >
                  <span className="text-[var(--muted-foreground)]">@</span>
                  {s.slice(s.indexOf("@") + 1)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <AnimatePresence initial={false}>
          {isNew && (phase === "name" || phase === "otp") ? (
            <Reveal key="name" motionProps={reveal}>
              <Field
                label="Full name"
                autoComplete="name"
                autoCapitalize="words"
                autoFocus={phase === "name"}
                value={fullName}
                readOnly={phase !== "name"}
                onChange={(e) => setFullName(e.target.value)}
                error={error?.field === "name" ? error.message : undefined}
                className={phase !== "name" ? "bg-[var(--muted)] text-[var(--muted-foreground)]" : undefined}
              />
            </Reveal>
          ) : null}

          {phase === "otp" ? (
            <Reveal key="otp" motionProps={reveal}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="gate-code" className="font-semibold">Code sent to {email}</Label>
                <CodeOtp
                  id="gate-code"
                  autoFocus
                  value={code}
                  onChange={(v: string) => setCode(v)}
                  onComplete={(v: string) => void onSubmit(undefined, v)}
                  aria-invalid={error?.field === "code"}
                />
                {error?.field === "code" ? (
                  <p role="alert" className="text-[13px] font-medium text-[#be123c] dark:text-[#fda4af]">{error.message}</p>
                ) : resent ? (
                  <p role="status" className="c-caption">New code sent. It works for 10 minutes.</p>
                ) : (
                  <p className="c-caption">It works for 10 minutes. Check spam if it isn&apos;t there.</p>
                )}
                <button type="button" onClick={resend} className="c-caption self-start py-1 font-semibold text-[var(--primary)] underline-offset-4 hover:underline">
                  Resend code
                </button>
              </div>
            </Reveal>
          ) : null}

          {phase === "staff" ? (
            <Reveal key="staff" motionProps={reveal}>
              <Notice>
                {email} belongs to Tiffin Grab staff. Sign in to the dashboard, or use a personal email to order.
              </Notice>
            </Reveal>
          ) : null}
        </AnimatePresence>

        {error?.field === "form" ? <Notice tone="error">{error.message}</Notice> : null}

        {phase === "staff" ? (
          <div className="flex flex-col gap-3">
            <Button variant="hero" onClick={() => router.push("/login")}>Sign in to the dashboard</Button>
            <Button variant="quiet" pill size="lg" onClick={changeEmail}>Use a different email</Button>
          </div>
        ) : (
          <Button type="submit" variant="hero" pending={pending} className="w-full">
            {cta}
          </Button>
        )}
      </div>
    </form>
  );
}

function Reveal({ children, motionProps }: { children: ReactNode; motionProps: object }) {
  return (
    <motion.div layout {...motionProps} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
