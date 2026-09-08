"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { emailSchema } from "@foundry/commons";
import { authClient, signIn } from "@/lib/auth/client";
import { checkExistingAccount } from "@/app/(public)/subscribe/actions";
import { Button } from "@foundry/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { CodeOtp } from "@foundry/auth-ui";

// Gates entry to the subscribe wizard: ask for an email, check it against
// existing accounts, and offer a non-blocking sign-in on a match instead of
// letting the visitor rediscover the account (and any plan overlap) only at
// final checkout submit. See
// docs/superpowers/specs/2026-09-08-subscribe-identity-gate-design.md.
//
// Styled to match the subscribe wizard's own brutalist-ticket look (bordered
// card, pill buttons, glow CTA) rather than generic shadcn defaults — see
// components/wizard/steps/step-bundle.tsx and components/checkout/checkout.tsx
// for the same border-[1.5px] border-foreground / rounded-full vocabulary.
//
// States: "email" (asking) -> "revealed" (render children, no match or
// guest chose to continue) -> "matched" (soft prompt) -> "otp" (inline
// sign-in code entry, then redirect to /me/renew on success).
type GateState = "email" | "matched" | "otp" | "revealed";

const emailStepSchema = z.object({ email: emailSchema });
const otpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") });

export function IdentityGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>("email");
  const [email, setEmail] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const emailForm = useForm<z.infer<typeof emailStepSchema>>({
    resolver: zodResolver(emailStepSchema),
    defaultValues: { email: "" },
  });
  const codeForm = useForm<z.infer<typeof otpCodeSchema>>({
    resolver: zodResolver(otpCodeSchema),
    defaultValues: { code: "" },
  });

  async function submitEmail(values: z.infer<typeof emailStepSchema>) {
    setEmail(values.email);
    try {
      const result = await checkExistingAccount(values.email);
      setState(result.status === "matched" ? "matched" : "revealed");
    } catch {
      // Fail open — a non-essential pre-check must never block checkout.
      setState("revealed");
    }
  }

  async function sendCode() {
    setOtpError(null);
    setSending(true);
    try {
      await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      setState("otp");
    } catch {
      setOtpError("Couldn't send the code. Try again, or continue as guest.");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(values: z.infer<typeof otpCodeSchema>) {
    setOtpError(null);
    try {
      const result = await signIn.emailOtp({ email, otp: values.code });
      if (result?.error) {
        setOtpError("Invalid or expired code.");
        return;
      }
      router.push("/me/renew");
      router.refresh();
    } catch {
      setOtpError("Couldn't sign you in. Try again, or continue as guest.");
    }
  }

  if (state === "revealed") return <>{children}</>;

  return (
    <div className="border-foreground rounded-2xl border-[1.5px] p-4.5 sm:p-6">
      {state === "email" && (
        <Form {...emailForm}>
          <form onSubmit={emailForm.handleSubmit(submitEmail)} className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.02em]">What&apos;s your email?</h2>
              <p className="text-muted-foreground mt-1 text-sm text-pretty">
                We&apos;ll check if you already have an account.
              </p>
            </div>
            <FormField
              control={emailForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="border-foreground h-13 rounded-2xl border-[1.5px] px-4"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="hover-lift h-14 w-full rounded-full shadow-[0_12px_30px_-6px_var(--color-primary)]"
              disabled={emailForm.formState.isSubmitting}
            >
              Continue
            </Button>
          </form>
        </Form>
      )}

      {state === "matched" && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-[-0.02em]">Welcome back</h2>
            <p className="text-muted-foreground mt-1 text-sm text-pretty">
              This email is linked to an existing account — sign in to continue with your saved plan.
            </p>
          </div>
          {otpError ? <p className="text-destructive text-sm">{otpError}</p> : null}
          <Button
            type="button"
            className="hover-lift h-14 w-full rounded-full shadow-[0_12px_30px_-6px_var(--color-primary)]"
            onClick={() => setState("revealed")}
          >
            Continue as guest
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-foreground h-14 w-full rounded-full border-[1.5px]"
            onClick={sendCode}
            disabled={sending}
          >
            Sign in
          </Button>
        </div>
      )}

      {state === "otp" && (
        <Form {...codeForm}>
          <form onSubmit={codeForm.handleSubmit(verifyCode)} className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.02em]">Enter your code</h2>
              <p className="text-muted-foreground mt-1 text-sm text-pretty">
                We emailed a 6-digit code to {email}.
              </p>
            </div>
            <FormField
              control={codeForm.control}
              name="code"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Verification code</FormLabel>
                  <FormControl>
                    <CodeOtp
                      value={field.value}
                      onChange={field.onChange}
                      onComplete={() => codeForm.handleSubmit(verifyCode)()}
                      aria-invalid={!!fieldState.error}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {otpError ? <p className="text-destructive text-sm">{otpError}</p> : null}
            <Button
              type="submit"
              className="hover-lift h-14 w-full rounded-full shadow-[0_12px_30px_-6px_var(--color-primary)]"
              disabled={codeForm.formState.isSubmitting}
            >
              Sign in
            </Button>
            <Button type="button" variant="ghost" className="h-12 w-full rounded-full" onClick={() => setState("revealed")}>
              Continue as guest instead
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
}
