"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authClient, signIn } from "@/lib/auth/client";
import { clearLockSession } from "@/lib/auth/lock-actions";
import { PinOtp } from "@/components/pin-otp";
import { CodeOtp } from "@realm/auth-ui";
import { Button } from "@realm/ui/button";
import { Card, CardContent } from "@realm/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { verifyPinAction } from "./actions";

// Single auth screen. Password by default; when a locked session with a PIN
// exists (`canUsePin`), it defaults to PIN entry and offers an in-place toggle
// to password (and vice-versa). No navigation between the two → no back button.
type Mode = "email-otp" | "password" | "pin";

export function AuthForm({ canUsePin }: { canUsePin: boolean }) {
  // Default to email-OTP (passwordless) — the primary method until SMS/WhatsApp
  // exists. A locked session (PIN available) opens in PIN mode; both panels offer
  // in-place toggles, so there's no navigation between methods.
  const [mode, setMode] = useState<Mode>(canUsePin ? "pin" : "email-otp");

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            {mode === "pin" ? (
              <PinPanel onUsePassword={() => setMode("password")} />
            ) : mode === "email-otp" ? (
              <EmailOtpPanel onUsePassword={() => setMode("password")} />
            ) : (
              <PasswordPanel
                canUsePin={canUsePin}
                onUsePin={() => setMode("pin")}
                onUseEmailOtp={() => setMode("email-otp")}
              />
            )}
          </div>
          <div className="bg-muted text-muted-foreground relative hidden flex-col items-center justify-center gap-2 p-8 md:flex">
            <span className="text-foreground text-2xl font-bold">Tiffin Grab</span>
            <p className="text-balance text-center text-sm">
              Fresh tiffin meals, delivered on your schedule.
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="text-muted-foreground hover:[&_a]:text-primary text-balance text-center text-xs [&_a]:underline [&_a]:underline-offset-4">
        By continuing, you agree to our <Link href="/terms">Terms of Service</Link>{" "}
        and <Link href="/privacy">Privacy Policy</Link>.
      </div>
    </div>
  );
}

const passwordSchema = z.object({
  identifier: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

function PasswordPanel({ canUsePin, onUsePin, onUseEmailOtp }: { canUsePin: boolean; onUsePin: () => void; onUseEmailOtp: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { identifier: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof passwordSchema>) {
    setError(null);
    try {
      const { identifier, password } = values;
      const result = await signIn.email({ email: identifier, password });
      if (result?.error) {
        setError("Invalid credentials");
        return;
      }
    } catch {
      setError("Invalid credentials");
      return;
    }
    // A full sign-in clears any prior lock so we don't bounce to a PIN prompt.
    await clearLockSession();
    router.push(params.get("callbackUrl") ?? "/dashboard");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-muted-foreground text-balance">Sign in to your Tiffin Grab account</p>
          </div>
          {canUsePin && (
            <Button type="button" variant="outline" className="gap-2" onClick={onUsePin}>
              <LockIcon className="size-4" />
              Unlock with your PIN instead
            </Button>
          )}
          <FormField
            control={form.control}
            name="identifier"
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
                  <Link href="/forgot-password" className="ml-auto text-sm underline-offset-2 hover:underline">
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
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            Sign in
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onUseEmailOtp}>
            Email me a sign-in code instead
          </Button>
          <div className="text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Sign up
            </Link>
          </div>
        </div>
      </form>
    </Form>
  );
}

const otpEmailSchema = z.object({ email: z.email("Enter a valid email") });
const otpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") });

// Passwordless sign-in: email a 6-digit code, then sign in with it. The default
// method until SMS/WhatsApp exists. Auto-registers a new email (magic-link style).
function EmailOtpPanel({ onUsePassword }: { onUsePassword: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const emailForm = useForm<z.infer<typeof otpEmailSchema>>({ resolver: zodResolver(otpEmailSchema), defaultValues: { email: "" } });
  const codeForm = useForm<z.infer<typeof otpCodeSchema>>({ resolver: zodResolver(otpCodeSchema), defaultValues: { code: "" } });

  async function sendCode(values: z.infer<typeof otpEmailSchema>) {
    setError(null);
    // Never reveal whether the address exists — advance regardless of result.
    await authClient.emailOtp.sendVerificationOtp({ email: values.email, type: "sign-in" });
    setEmail(values.email);
    setStep("code");
  }

  async function verify(values: z.infer<typeof otpCodeSchema>) {
    setError(null);
    const result = await signIn.emailOtp({ email, otp: values.code });
    if (result?.error) {
      setError("Invalid or expired code.");
      return;
    }
    await clearLockSession();
    router.push(params.get("callbackUrl") ?? "/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground text-balance">
          {step === "email" ? "Sign in with a code sent to your email" : `Enter the code we emailed to ${email}`}
        </p>
      </div>
      {step === "email" ? (
        <Form {...emailForm}>
          {/* key forces a remount across the step swap — otherwise React reuses the
              prior step's <form>/<input> DOM nodes, and the reused input's native
              value-tracker can desync from the segmented OTP field's controlled value. */}
          <form key="email" onSubmit={emailForm.handleSubmit(sendCode)} className="flex flex-col gap-4">
            <FormField control={emailForm.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" autoComplete="email" placeholder="you@example.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={emailForm.formState.isSubmitting}>Email me a code</Button>
          </form>
        </Form>
      ) : (
        <Form {...codeForm}>
          <form key="code" onSubmit={codeForm.handleSubmit(verify)} className="flex flex-col gap-4">
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
                      onComplete={() => codeForm.handleSubmit(verify)()}
                      aria-invalid={!!fieldState.error}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={codeForm.formState.isSubmitting}>Sign in</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("email"); setError(null); }}>Use a different email</Button>
          </form>
        </Form>
      )}
      <Button type="button" variant="ghost" className="w-full" onClick={onUsePassword}>Sign in with a password instead</Button>
      <div className="text-center text-sm">
        Don&apos;t have an account? <Link href="/signup" className="underline underline-offset-4">Sign up</Link>
      </div>
    </div>
  );
}

function PinPanel({ onUsePassword }: { onUsePassword: () => void }) {
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
      // Too many attempts — the action signed us out. Fall back to password.
      onUsePassword();
      return;
    }
    setError("Incorrect PIN. Try again.");
    setPin("");
    setPending(false);
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-md">
          <LockIcon className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">Session locked</h1>
        <p className="text-muted-foreground text-sm">Enter your PIN to continue.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); verify(pin); }} className="flex w-full flex-col items-center gap-3">
        <PinOtp value={pin} onChange={setPin} onComplete={verify} autoFocus disabled={pending} aria-label="PIN" />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" disabled={pending || pin.length !== 4} className="w-full">
          Unlock
        </Button>
        <button type="button" className="text-muted-foreground text-sm underline" onClick={onUsePassword}>
          Sign in with password instead
        </button>
      </form>
    </div>
  );
}
