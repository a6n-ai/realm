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
import { AuthScreen, AuthWelcome, EmailCodeSignIn } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { IOS_BUTTON, IOS_PRESS } from "@/components/customer/ios-button";
import { verifyPinAction } from "./actions";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";
import { IOS_INPUT, tiffinAuthUi } from "@/components/auth/auth-kit";

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

  async function landSignedIn() {
    await clearLockSession();
    router.push(callbackUrl ?? "/dashboard");
    router.refresh();
  }

  return (
    <AuthScreen
      footer={<>By continuing, you agree to our <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.</>}
    >
      {/* key remounts on mode change so each swap gets the panel's own entrance. */}
      <div key={mode} className="flex flex-1 flex-col">
        {mode === "welcome" ? (
          <AuthWelcome
            ui={tiffinAuthUi}
            art={
              <div className="flex flex-col items-center gap-3">
                <BrandMark className="size-24" />
                <BrandWordmark className="text-3xl" />
              </div>
            }
            title="Home-style meals, your way."
            tagline="Fresh tiffin meals, delivered on your schedule."
            primary={{ label: "Sign in", onClick: () => setMode("email-otp") }}
            secondary={{ label: "Get started", onClick: () => router.push("/subscribe") }}
          />
        ) : mode === "pin" ? (
          <PinPanel onUsePassword={() => setMode("password")} />
        ) : mode === "email-otp" ? (
          <EmailCodeSignIn
            ui={tiffinAuthUi}
            title="Welcome back"
            subtitle="Sign in with a code sent to your email."
            onBack={callbackUrl ? undefined : () => setMode("welcome")}
            onSendCode={(email) => authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })}
            onVerify={(email, otp) => signIn.emailOtp({ email, otp })}
            onSuccess={landSignedIn}
            extra={
              <button type="button" onClick={() => setMode("password")} className={`text-muted-foreground mx-auto min-h-11 text-[15px] underline-offset-4 hover:underline ${IOS_PRESS}`}>
                Sign in with a password instead
              </button>
            }
          />
        ) : (
          <PasswordPanel
            canUsePin={canUsePin}
            onUsePin={() => setMode("pin")}
            onUseEmailOtp={() => setMode("email-otp")}
          />
        )}
      </div>
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
        setError(msg && SAFE_POST_AUTH_ERRORS.has(msg) ? msg : "Invalid credentials");
        return;
      }
    } catch {
      setError("Invalid credentials");
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
      <form method="post" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold tracking-[-0.02em]">Welcome back</h1>
            <p className="text-muted-foreground text-balance">Sign in to your Tiffin Grab account</p>
          </div>
          {canUsePin && (
            <Button type="button" variant="outline" className={`gap-2 ${IOS_BUTTON}`} onClick={onUsePin}>
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
          {error ? <p className="text-destructive animate-in fade-in text-sm text-center duration-150">{error}</p> : null}
          <Button type="submit" className={IOS_BUTTON} disabled={form.formState.isSubmitting}>
            Sign in
          </Button>
          <Button type="button" variant="ghost" className={IOS_BUTTON} onClick={onUseEmailOtp}>
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
        <button type="button" className={`text-muted-foreground text-sm underline ${IOS_PRESS}`} onClick={onUsePassword}>
          Sign in with password instead
        </button>
      </form>
    </div>
  );
}
