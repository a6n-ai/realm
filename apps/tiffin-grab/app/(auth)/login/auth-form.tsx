"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { emailSchema } from "@foundry/commons";
import { authClient, signIn } from "@/lib/auth/client";
import { clearLockSession } from "@/lib/auth/lock-actions";
import { PinOtp } from "@/components/pin-otp";
import { AUTH_LINK, AuthScreen, AuthWelcome, EmailCodeSignIn, authErrorMessage } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { IOS_BUTTON, IOS_PRESS } from "@/components/customer/ios-button";
import { verifyPinAction } from "./actions";
import { clearPendingSignIn, rememberPendingSignIn } from "../code/pending-sign-in";
import { AuthLegal, AuthLogo, IOS_INPUT, tiffinAuthUi } from "@/components/auth/auth-kit";

// Login is the shared gateway into both the customer and staff shells, so it
// draws with the customer app's iOS-sized controls (components/auth/auth-kit).
// The welcome -> email -> code flow itself is shared @foundry/auth-ui; this app
// only skins it and decides where a signed-in user lands.
type Mode = "welcome" | "email-otp" | "password" | "pin";

// callbackUrl comes off the query string, so anyone can craft a login link with
// it. Only a same-site path ("/x", not "//evil.com" or "/\\evil.com") may be
// followed after sign-in; anything else lands on the dashboard.
// Parsed with URL rather than pattern-matched: the parser strips tabs/newlines
// and folds backslashes exactly as the browser will, so "/\t/evil.com" is seen
// as the "//evil.com" it becomes.
export function safeCallbackUrl(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/")) return null;
  const base = "https://same.invalid";
  try {
    const url = new URL(raw, base);
    return url.origin === base ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

export function AuthForm({ canUsePin }: { canUsePin: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = safeCallbackUrl(params.get("callbackUrl"));
  // A locked session opens on its PIN. Someone bounced here from a protected
  // page (callbackUrl) already knows why they're here, so they skip the
  // welcome screen and land on the form.
  const [mode, setMode] = useState<Mode>(canUsePin ? "pin" : callbackUrl ? "email-otp" : "welcome");
  const [codeStep, setCodeStep] = useState(false);

  async function landSignedIn() {
    clearPendingSignIn();
    await clearLockSession();
    router.push(callbackUrl ?? "/dashboard");
    router.refresh();
  }

  // Revolut-style: one screen. The mark stays put, the headline retitles per
  // step in the same spot, and only the form underneath swaps.
  const HEAD: Record<Exclude<Mode, "pin">, { title: string; tagline?: string }> = {
    welcome: { title: "Home-style meals, your way.", tagline: "Fresh tiffin meals, delivered on your schedule." },
    "email-otp": codeStep
      ? { title: "Enter the code" }
      : { title: "Welcome back", tagline: "Sign in with a code sent to your email." },
    password: { title: "Welcome back", tagline: "Sign in with your email and password." },
  };

  return (
    <AuthScreen
      footer={<AuthLegal />}
    >
      {mode === "pin" ? (
        <PinPanel onUsePassword={() => setMode("password")} />
      ) : (
        <AuthWelcome
          ui={tiffinAuthUi}
          art={<AuthLogo />}
          title={HEAD[mode].title}
          tagline={HEAD[mode].tagline}
          primary={{ label: "Sign in", onClick: () => setMode("email-otp") }}
          secondary={{ label: "Get started", onClick: () => router.push("/subscribe") }}
        >
          {mode === "email-otp" ? (
            <EmailCodeSignIn
              compact
              ui={tiffinAuthUi}
              onStepChange={(step) => setCodeStep(step === "code")}
              onBack={callbackUrl ? undefined : () => setMode("welcome")}
              onSendCode={(email) => {
                rememberPendingSignIn(email, callbackUrl);
                return authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
              }}
              onVerify={(email, otp) => signIn.emailOtp({ email, otp })}
              onSuccess={landSignedIn}
              extra={
                <button type="button" onClick={() => setMode("password")} className={AUTH_LINK}>
                  Sign in with a password instead
                </button>
              }
            />
          ) : mode === "password" ? (
            <PasswordPanel
              canUsePin={canUsePin}
              onUsePin={() => setMode("pin")}
              onUseEmailOtp={() => { setCodeStep(false); setMode("email-otp"); }}
            />
          ) : null}
        </AuthWelcome>
      )}
    </AuthScreen>
  );
}

// Better Auth verifies the password *before* throwing any of these (see
// node_modules/better-auth/dist/api/routes/sign-in.mjs — EMAIL_NOT_VERIFIED
// and our own session-create FORBIDDEN hook both fire only after a correct
// password), so surfacing them isn't pre-auth account enumeration. Matched by
// exact text (not error.code, which isn't set on our own custom APIError
// throws) so nothing else — including a future, more revealing server
// message — passes through un-vetted.
const SAFE_POST_AUTH_ERRORS = new Set([
  "Email not verified",
  "Verify your email address first — check your inbox for the link.",
  "This account is not active. Contact support.",
]);

const passwordSchema = z.object({
  // emailSchema (not z.email) lowercases + trims so a differently-cased login
  // matches the checkout-provisioned account — otherwise a new account is created
  // and the customer's order (on the original account) doesn't show.
  identifier: emailSchema,
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
        const msg = result.error.message;
        setError(msg && SAFE_POST_AUTH_ERRORS.has(msg) ? msg : authErrorMessage(result.error, "password"));
        return;
      }
    } catch {
      setError(authErrorMessage(null, "password"));
      return;
    }
    // A full sign-in clears any prior lock so we don't bounce to a PIN prompt.
    await clearLockSession();
    router.push(safeCallbackUrl(params.get("callbackUrl")) ?? "/dashboard");
    router.refresh();
  }

  return (
    <Form {...form}>
      {/* method="post": a tap before hydration would otherwise GET /login with
          the email and password in the query string (history, logs, Referer). */}
      <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col">
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 flex flex-1 flex-col gap-5 duration-300 ease-out">
          <FormField
            control={form.control}
            name="identifier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="you@example.com" className={IOS_INPUT} {...field} />
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
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className={`${IOS_INPUT} pr-12`}
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className={`text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-12 items-center justify-center ${IOS_PRESS}`}
                    >
                      {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error ? <p className="text-destructive animate-in fade-in text-sm duration-150">{error}</p> : null}
          {/* Same bottom group as every auth screen: main button, then the
              secondary actions centered beneath it. */}
          <div className="mt-auto flex flex-col gap-3 pt-4 sm:mt-2">
            <Button type="submit" className={IOS_BUTTON} disabled={form.formState.isSubmitting}>
              Sign in
            </Button>
            <div className="flex flex-col items-center">
              <Link href="/forgot-password" className={`${AUTH_LINK} inline-flex items-center`}>Forgot your password?</Link>
              <button type="button" onClick={onUseEmailOtp} className={AUTH_LINK}>Email me a sign-in code instead</button>
              {canUsePin ? (
                <button type="button" onClick={onUsePin} className={`${AUTH_LINK} inline-flex items-center gap-1.5`}>
                  <LockIcon className="size-3.5" aria-hidden />
                  Unlock with your PIN instead
                </button>
              ) : null}
              <p className="text-muted-foreground min-h-11 content-center text-sm">
                New here? <Link href="/signup" className="text-foreground font-medium underline-offset-4 hover:underline">Create an account</Link>
              </p>
            </div>
          </div>
        </div>
      </form>
    </Form>
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
      <form method="post" onSubmit={(e) => { e.preventDefault(); verify(pin); }} className="flex w-full flex-col items-center gap-3">
        <PinOtp value={pin} onChange={setPin} onComplete={verify} autoFocus disabled={pending} aria-label="PIN" />
        {error && <p className="text-destructive animate-in fade-in text-sm text-center duration-150">{error}</p>}
        <Button type="submit" disabled={pending || pin.length !== 4} className={IOS_BUTTON}>
          Unlock
        </Button>
        <button type="button" className={AUTH_LINK} onClick={onUsePassword}>
          Sign in with password instead
        </button>
      </form>
    </div>
  );
}
