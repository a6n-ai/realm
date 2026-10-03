"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { z } from "zod";
import { AuthScreen, AuthWelcome, EmailCodeSignIn } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { authClient, signIn } from "@/lib/auth/client";
import { landingPathFor } from "@/lib/auth/landing";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;


type Mode = "welcome" | "password" | "email-otp";

/**
 * Staff and customer login on the shared @foundry/auth-ui screens: a welcome
 * screen, then the email-code flow customers use or the password form staff use.
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
  // Set by onVerify, read by onSuccess: landing depends on the signed-in role.
  const role = useRef<string | undefined>(undefined);

  return (
    <AuthScreen>
      <div key={mode} className="flex flex-1 flex-col">
        {mode === "welcome" ? (
          <AuthWelcome
            art={
              <span className="text-[44px] font-bold leading-none tracking-[-0.03em] text-[var(--red)]">Puchkaman</span>
            }
            title="Sign in to track your orders"
            tagline="Staff sign in here too, to reach the operations console."
            primary={{ label: "Sign in", onClick: () => setMode("email-otp") }}
            secondary={{ label: "Browse the menu", onClick: () => router.push("/eats") }}
          />
        ) : mode === "email-otp" ? (
          <EmailCodeSignIn
            title="Welcome back"
            subtitle="Sign in with a code sent to your email."
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
            // Sign-in never creates accounts, so an unknown address gets silence
            // rather than a code. Say so, or a typo looks like a broken mail server.
            codeHint="No code? Check the address. Codes only go to existing accounts."
            extra={
              <button
                type="button"
                onClick={() => setMode("password")}
                className="text-muted-foreground mx-auto min-h-11 text-sm underline-offset-4 hover:underline"
              >
                Sign in with a password instead
              </button>
            }
          />
        ) : (
          <PasswordPanel onUseEmailOtp={() => setMode("email-otp")} />
        )}
      </div>
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
      setError("Invalid email or password");
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
      <form method="post" onSubmit={form.handleSubmit(onSubmit)}>
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
