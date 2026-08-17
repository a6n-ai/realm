"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { z } from "zod";
import { CodeOtp } from "@realm/auth-ui";
import { Button } from "@realm/ui/button";
import { Card, CardContent } from "@realm/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { authClient, signIn } from "@/lib/auth/client";
import { landingPathFor } from "@/lib/auth/landing";
import { useResendCooldown } from "@/lib/auth/use-resend-cooldown";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

const otpEmailSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
});

type Mode = "password" | "email-otp";

/** Staff and customer login — same Card split as tiffin-grab; yellow panel + green CTAs, red wordmark. */
export function LoginForm() {
  const [mode, setMode] = useState<Mode>("password");

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            {mode === "password" ? (
              <PasswordPanel onUseEmailOtp={() => setMode("email-otp")} />
            ) : (
              <EmailOtpPanel onUsePassword={() => setMode("password")} />
            )}
          </div>
          {/* Yellow brand panel + green CTAs (crm primary); wordmark stays red. */}
          <div className="relative hidden flex-col items-center justify-center gap-2 border-l border-[var(--green)] bg-[var(--yellow)] p-8 text-[var(--ink)] md:flex">
            <span className="text-2xl font-bold text-[var(--red)]">Puchkaman</span>
            <p className="text-balance text-center text-sm opacity-80">
              Sign in to track your orders — or to reach the operations console.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordPanel({ onUseEmailOtp }: { onUseEmailOtp: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    const result = await signIn.email({ email: values.email, password: values.password });
    if (result?.error) {
      setError("Invalid email or password");
      return;
    }
    const role = (result?.data?.user as { role?: string } | undefined)?.role;
    router.push(landingPathFor(role, params.get("callbackUrl")));
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-muted-foreground text-balance">Sign in to the operations console</p>
          </div>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="ml-auto text-sm underline-offset-2 hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="pr-10"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center"
                    >
                      {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            Sign in
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onUseEmailOtp}>
            Email me a sign-in code instead
          </Button>
        </div>
      </form>
    </Form>
  );
}

function EmailOtpPanel({ onUsePassword }: { onUsePassword: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [cooldown, startCooldown] = useResendCooldown(30);

  const emailForm = useForm<z.infer<typeof otpEmailSchema>>({
    resolver: zodResolver(otpEmailSchema),
    defaultValues: { email: "" },
  });

  /** Returns whether a code actually went out, so the caller can advance the step. */
  async function requestCode(target: string): Promise<boolean> {
    setError(null);
    setBusy(true);
    const { error: err } = await authClient.emailOtp.sendVerificationOtp({
      email: target,
      type: "sign-in",
    });
    setBusy(false);
    if (err) {
      setError(
        err.status === 429
          ? "Too many codes requested. Try again in a minute."
          : "Could not send the code. Try again.",
      );
      return false;
    }
    startCooldown();
    return true;
  }

  async function sendCode(values: z.infer<typeof otpEmailSchema>) {
    if (!(await requestCode(values.email))) return;
    setEmail(values.email);
    setStep("code");
  }

  async function resend() {
    if (busy || cooldown > 0) return;
    setNotice(null);
    if (await requestCode(email)) setNotice("New code sent.");
  }

  async function verify(otp: string) {
    setError(null);
    setBusy(true);
    const result = await signIn.emailOtp({ email, otp });
    setBusy(false);
    if (result?.error) {
      setError("Invalid or expired code");
      return;
    }
    const role = (result?.data?.user as { role?: string } | undefined)?.role;
    router.push(landingPathFor(role, params.get("callbackUrl")));
    router.refresh();
  }

  if (step === "email") {
    return (
      <Form {...emailForm}>
        <form onSubmit={emailForm.handleSubmit(sendCode)}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center text-center">
              <h1 className="text-2xl font-bold">Email sign-in code</h1>
              <p className="text-muted-foreground text-balance">We&apos;ll email a one-time code</p>
            </div>
            <FormField
              control={emailForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Email me a code"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={onUsePassword}>
              Sign in with a password instead
            </Button>
          </div>
        </form>
      </Form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-bold">Enter code</h1>
        <p className="text-muted-foreground text-balance">We emailed a code to {email}</p>
        {/* Sign-in no longer creates accounts, so an address with no account
            gets silence rather than a code. Say so, or a typo looks like a
            broken mail server. */}
        <p className="text-muted-foreground mt-1 text-xs text-balance">
          No code? Check the address — codes only go to existing accounts.
        </p>
      </div>
      <CodeOtp
        value={code}
        onChange={setCode}
        onComplete={(value) => {
          void verify(value);
        }}
        disabled={busy}
        autoFocus
      />
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-muted-foreground text-sm" role="status">
          {notice}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={resend}
        disabled={busy || cooldown > 0}
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
          setNotice(null);
        }}
      >
        Use a different email
      </Button>
    </div>
  );
}
