"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { emailSchema, passwordSchema } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { Card, CardContent } from "@foundry/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { signIn } from "@/lib/auth/client";
import { SITE_NAME } from "@/lib/brand";
import { signUpCustomer } from "./actions";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: emailSchema,
  password: passwordSchema,
});

type FormValues = z.infer<typeof schema>;

export function SignupForm() {
  const router = useRouter();
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
    router.push("/me");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 md:p-8">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center text-center">
                  <h1 className="text-2xl font-bold">Create a family account</h1>
                  <p className="text-muted-foreground text-balance">Join {SITE_NAME} to manage classes and bookings.</p>
                </div>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input autoComplete="name" placeholder="Your name" {...field} />
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
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
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
                  Create account
                </Button>
                <p className="text-muted-foreground text-center text-sm">
                  Already have an account?{" "}
                  <Link href="/login" className="underline underline-offset-4">
                    Sign in
                  </Link>
                </p>
              </div>
            </form>
          </Form>
          <div className="bg-primary text-primary-foreground relative hidden flex-col items-center justify-center gap-2 border-l p-8 md:flex">
            <span className="text-2xl font-bold">{SITE_NAME}</span>
            <p className="text-balance text-center text-sm opacity-90">
              Families, members, and admins share one login. Staff accounts are invited.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
