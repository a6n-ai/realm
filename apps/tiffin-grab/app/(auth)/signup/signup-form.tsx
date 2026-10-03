"use client";

import { AuthPanel, AuthScreen } from "@foundry/auth-ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { emailSchema, passwordSchema } from "@foundry/commons";
import type { Country } from "react-phone-number-input";
import { z } from "zod";
import { Button } from "@foundry/ui/button";
import { IOS_BUTTON } from "@/components/customer/ios-button";
import { AuthLegal, AuthLogo, IOS_INPUT } from "@/components/auth/auth-kit";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { signUpCustomer } from "./actions";

const PhoneInput = dynamic(
  () => import("@foundry/ui/phone-input").then((m) => m.PhoneInput),
  { ssr: false, loading: () => <Input disabled placeholder="Phone" /> },
);

const schema = z.object({
  phone: z.string().min(1, "Phone is required"),
  email: emailSchema,
  name: z.string().trim().optional(),
  // Shared schema so the form and the server agree on the 12-char minimum.
  password: passwordSchema,
});

type FormValues = z.infer<typeof schema>;

export function SignupForm({ defaultCountry }: { defaultCountry: Country }) {
  const [error, setError] = useState<string | null>(null);
  // Set once the account exists and the verification mail has gone out.
  const [sent, setSent] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: "", email: "", name: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    const result = await signUpCustomer({
      phone: values.phone,
      email: values.email,
      name: values.name || undefined,
      password: values.password,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // No auto sign-in: a verified email is required to hold a session, and the
    // phone sign-in this used to call is the one route better-auth does not gate
    // on verification — so signing in here would have walked straight past the
    // requirement. The signup action has mailed a verification link; clicking it
    // verifies and signs them in.
    setSent(values.email);
  }

  if (sent) {
    return (
      <AuthScreen footer={<AuthLegal />}>
        <AuthPanel
          art={<AuthLogo />}
          title="Check your email"
          tagline="Open the link we sent to finish setting up your account and sign in."
        >
          <div className="flex flex-1 flex-col gap-5">
            <p className="text-[15px]">
              We sent a verification link to <span className="font-medium [overflow-wrap:anywhere]">{sent}</span>.
            </p>
            <p className="text-muted-foreground text-sm">No email after a few minutes? Sign in and we&apos;ll send a fresh link.</p>
            <div className="mt-auto pt-4 sm:mt-2">
              <Button asChild className={IOS_BUTTON}>
                <Link href="/login">Go to sign in</Link>
              </Button>
            </div>
          </div>
        </AuthPanel>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen footer={<AuthLegal />}>
      <AuthPanel art={<AuthLogo />} title="Create your account" tagline="Sign up to order and manage your tiffin plan.">
          <Form {...form}>
            <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col gap-5">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <PhoneInput {...field} defaultCountry={defaultCountry} />
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
                        <Input className={IOS_INPUT} type="email" autoComplete="email" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Input className={IOS_INPUT} autoComplete="name" placeholder="Your name" {...field} />
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
                            autoComplete="new-password"
                            className={`${IOS_INPUT} pr-12`}
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
                {error ? <p className="text-destructive text-sm">{error}</p> : null}
                <div className="mt-auto flex flex-col gap-3 pt-4 sm:mt-2">
                  <Button type="submit" className={IOS_BUTTON} disabled={form.formState.isSubmitting}>
                    Create account
                  </Button>
                  <p className="text-muted-foreground min-h-11 content-center text-center text-sm">
                    Already have an account? <Link href="/login" className="text-foreground font-medium underline-offset-4 hover:underline">Sign in</Link>
                  </p>
                </div>
              </div>
            </form>
          </Form>
      </AuthPanel>
    </AuthScreen>
  );
}
