"use client";

import { AuthPanel, AuthScreen, GoogleSignInButton, oauthErrorMessage } from "@foundry/auth-ui";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { emailSchema, passwordSchema } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { signIn } from "@/lib/auth/client";
import { SITE_NAME } from "@/lib/brand";
import { signUpCustomer } from "./actions";
import { AUTH_BUTTON, AUTH_INPUT, AuthLogo, appAuthUi } from "@/components/auth/auth-kit";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: emailSchema,
  password: passwordSchema,
});

type FormValues = z.infer<typeof schema>;

export function SignupForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  // Sent here from /login when a Google address has no account yet.
  const oauthError = useSearchParams().get("error");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    const created = await signUpCustomer(values);
    if (!created.ok) {
      setError(created.error);
      return;
    }
    const result = await signIn.email({ email: values.email, password: values.password });
    if (result?.error) {
      router.push("/login");
      return;
    }
    router.push("/me/welcome");
    router.refresh();
  }

  return (
    <AuthScreen>
      <AuthPanel art={<AuthLogo />} title="Create your account" tagline={`Join ${SITE_NAME} to manage classes and bookings.`}>
          {googleEnabled ? (
            <div className="mb-5 flex flex-col gap-3">
              {oauthError === "signup_disabled" ? (
                <p role="status" className="text-muted-foreground text-sm">
                  No account for that Google address yet. Create one with Google below.
                </p>
              ) : oauthError ? (
                <p role="alert" className="text-destructive text-sm">{oauthErrorMessage(oauthError)}</p>
              ) : null}
              {/* requestSignUp: this is the one page that may create an account (see lib/auth). */}
              <GoogleSignInButton
                ui={appAuthUi}
                onSignIn={() =>
                  signIn.social({
                    provider: "google",
                    requestSignUp: true,
                    callbackURL: "/me/welcome",
                    errorCallbackURL: "/signup",
                  })
                }
              />
              <div className="text-muted-foreground flex items-center gap-3 text-xs" aria-hidden>
                <span className="bg-border h-px flex-1" />
                or
                <span className="bg-border h-px flex-1" />
              </div>
            </div>
          ) : null}
          <Form {...form}>
            <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col gap-5">
                                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input className={AUTH_INPUT} autoComplete="name" placeholder="Your name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input className={AUTH_INPUT} type="email" autoComplete="email" placeholder="you@example.com" {...field} />
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
                        <Input className={AUTH_INPUT} type="password" autoComplete="new-password" {...field} />
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
                <div className="pt-1">
<Button type="submit" className={AUTH_BUTTON} disabled={form.formState.isSubmitting}>
                  Create account
                </Button>
</div>
                <p className="text-muted-foreground text-center text-sm">
                  Already have an account?{" "}
                  <Link href="/login" className="underline underline-offset-4">
                    Sign in
                  </Link>
                </p>
              </div>
            </form>
          </Form>
      </AuthPanel>
    </AuthScreen>
  );
}
