"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { emailSchema, passwordSchema } from "@realm/commons";
import type { Country } from "react-phone-number-input";
import { z } from "zod";
import { Button } from "@realm/ui/button";
import { Card, CardContent } from "@realm/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { signUpCustomer } from "./actions";

const PhoneInput = dynamic(
  () => import("@realm/ui/phone-input").then((m) => m.PhoneInput),
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
      <div className="flex flex-col gap-6">
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <h1 className="text-2xl font-bold">Check your email</h1>
            <p className="text-muted-foreground text-balance">
              We sent a verification link to <span className="font-medium">{sent}</span>. Click it to
              finish setting up your account and sign in.
            </p>
            <p className="text-muted-foreground text-sm">
              Nothing yet? Check spam, or try signing in — we&apos;ll send a fresh link.
            </p>
            <Link href="/login" className="underline underline-offset-4">
              Go to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 md:p-8">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center text-center">
                  <h1 className="text-2xl font-bold">Create your account</h1>
                  <p className="text-muted-foreground text-balance">
                    Sign up for Tiffin Grab
                  </p>
                </div>
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
                        <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
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
                        <Input autoComplete="name" placeholder="Your name" {...field} />
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
                  Create account
                </Button>
                <div className="text-center text-sm">
                  Already have an account?{" "}
                  <Link href="/login" className="underline underline-offset-4">
                    Sign in
                  </Link>
                </div>
              </div>
            </form>
          </Form>
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
