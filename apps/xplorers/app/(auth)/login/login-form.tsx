"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { z } from "zod";
import { emailSchema } from "@foundry/commons";
import { AUTH_LINK, AuthScreen, AuthWelcome, EmailCodeSignIn, authErrorMessage } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { authClient, signIn } from "@/lib/auth/client";
import { landingPathFor } from "@/lib/auth/landing";
import { AUTH_BUTTON, AUTH_INPUT, AuthLogo, appAuthUi } from "@/components/auth/auth-kit";

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;


type Mode = "welcome" | "password" | "email-otp";

/**
 * Staff and customer login on the shared @foundry/auth-ui screens, Revolut-
 * style: one screen whose logo stays put, a title that retitles per step, and
 * a body that swaps from the welcome actions to the code or password form.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl");
  // A plain visit gets the welcome. Bounced from the console: straight to the
  // password form staff use; bounced from anywhere else: the code form.
  const [mode, setMode] = useState<Mode>(
    !callbackUrl ? "welcome" : callbackUrl.startsWith("/dashboard") ? "password" : "email-otp",
  );
  const [codeStep, setCodeStep] = useState(false);
  // Set by onVerify, read by onSuccess: landing depends on the signed-in role.
  const role = useRef<string | undefined>(undefined);

  const head =
    mode === "welcome"
      ? { title: "Welcome to Xplorers", tagline: "Families sign in with an emailed code. Staff use a password to reach the console." }
      : mode === "password"
        ? { title: "Welcome back", tagline: "Sign in with your email and password." }
        : codeStep
          ? { title: "Enter the code" }
          : { title: "Welcome back", tagline: "Sign in with a code sent to your email." };

  return (
    <AuthScreen>
      <AuthWelcome
        ui={appAuthUi}
        art={<AuthLogo />}
        title={head.title}
        tagline={head.tagline}
        primary={{ label: "Sign in", onClick: () => setMode("email-otp") }}
        secondary={{ label: "Create an account", onClick: () => router.push("/signup") }}
      >
        {mode === "email-otp" ? (
          <EmailCodeSignIn
            compact
            ui={appAuthUi}
            onStepChange={(step) => setCodeStep(step === "code")}
            onBack={callbackUrl ? undefined : () => setMode("welcome")}
            onSendCode={(email) => authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })}
            onVerify={async (email, otp) => {
              const result = await signIn.emailOtp({ email, otp });
              role.current = (result?.data?.user as { role?: string } | undefined)?.role;
              return result;
            }}
            onSuccess={() => {
              router.push(landingPathFor(role.current, callbackUrl));
              router.refresh();
            }}
            extra={
              <button type="button" onClick={() => setMode("password")} className={AUTH_LINK}>
                Sign in with a password instead
              </button>
            }
          />
        ) : mode === "password" ? (
          <PasswordPanel onUseEmailOtp={() => { setCodeStep(false); setMode("email-otp"); }} />
        ) : null}
      </AuthWelcome>
    </AuthScreen>
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
      setError(authErrorMessage(result.error, "password"));
      return;
    }
    const role = (result?.data?.user as { role?: string } | undefined)?.role;
    router.push(landingPathFor(role, params.get("callbackUrl")));
    router.refresh();
  }

  return (
    <Form {...form}>
      {/* method="post": a tap before hydration would otherwise GET /login with
          the email and password in the query string. */}
      <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col">
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 flex flex-1 flex-col gap-5 duration-300 ease-out">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="you@example.com" className={AUTH_INPUT} {...field} />
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
                      className={`${AUTH_INPUT} pr-12`}
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-12 items-center justify-center"
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
          {/* Same bottom group as every auth screen: main button, then the
              secondary actions centered beneath it. */}
          <div className="flex flex-col gap-3 pt-1">
            <Button type="submit" className={AUTH_BUTTON} disabled={form.formState.isSubmitting}>
              Sign in
            </Button>
            <div className="flex flex-col items-center">
              <Link href="/forgot-password" className={`${AUTH_LINK} inline-flex items-center`}>Forgot your password?</Link>
              <button type="button" onClick={onUseEmailOtp} className={AUTH_LINK}>Email me a sign-in code instead</button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
