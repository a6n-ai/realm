"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { passwordSchema } from "@realm/commons";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

type Step = "request" | "sent" | "phone-reset";

const requestSchema = z.object({
  identifier: z.string().min(1, "Phone or email is required"),
});

const phoneResetSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  newPassword: passwordSchema,
});

export function ForgotForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const requestForm = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: { identifier: "" },
  });

  const phoneResetForm = useForm<z.infer<typeof phoneResetSchema>>({
    resolver: zodResolver(phoneResetSchema),
    defaultValues: { code: "", newPassword: "" },
  });

  async function onRequestSubmit(values: z.infer<typeof requestSchema>) {
    setError(null);
    const { identifier } = values;
    // Both branches advance regardless of result so the response never reveals
    // whether the account exists. Genuine failures are logged (not shown) for
    // observability — they don't change the UX.
    if (/@/.test(identifier)) {
      const r = await authClient.requestPasswordReset({
        email: identifier,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (r?.error) console.error("[forgot] requestPasswordReset failed", r.error);
      setStep("sent");
    } else {
      const r = await authClient.phoneNumber.requestPasswordReset({ phoneNumber: identifier });
      if (r?.error) console.error("[forgot] phone requestPasswordReset failed", r.error);
      setPhone(identifier);
      setStep("phone-reset");
    }
  }

  async function onPhoneResetSubmit(values: z.infer<typeof phoneResetSchema>) {
    setError(null);
    const { code, newPassword } = values;
    const result = await authClient.phoneNumber.resetPassword({
      phoneNumber: phone,
      otp: code,
      newPassword,
    });
    if (result?.error) {
      setError("Invalid or expired code.");
      return;
    }
    router.push("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            {step === "request" && (
              <Form {...requestForm}>
                <form onSubmit={requestForm.handleSubmit(onRequestSubmit)}>
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col items-center text-center">
                      <h1 className="text-2xl font-bold">Reset your password</h1>
                      <p className="text-muted-foreground text-balance">
                        Enter your phone number or email address
                      </p>
                    </div>
                    <FormField
                      control={requestForm.control}
                      name="identifier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone or email</FormLabel>
                          <FormControl>
                            <Input
                              autoComplete="username"
                              placeholder="you@example.com or +1…"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {error ? <p className="text-destructive text-sm">{error}</p> : null}
                    <Button type="submit" className="w-full" disabled={requestForm.formState.isSubmitting}>
                      Send reset link
                    </Button>
                    <div className="text-center text-sm">
                      <Link href="/login" className="underline underline-offset-4">
                        Back to sign in
                      </Link>
                    </div>
                  </div>
                </form>
              </Form>
            )}

            {step === "sent" && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center text-center">
                  <h1 className="text-2xl font-bold">Check your email</h1>
                  <p className="text-muted-foreground text-balance">
                    If an account exists for that email, we&apos;ve sent a reset link.
                  </p>
                </div>
                <div className="text-center text-sm">
                  <Link href="/login" className="underline underline-offset-4">
                    Back to sign in
                  </Link>
                </div>
              </div>
            )}

            {step === "phone-reset" && (
              <Form {...phoneResetForm}>
                <form onSubmit={phoneResetForm.handleSubmit(onPhoneResetSubmit)}>
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col items-center text-center">
                      <h1 className="text-2xl font-bold">Enter your code</h1>
                      <p className="text-muted-foreground text-balance">
                        We sent a 6-digit code to your phone.
                      </p>
                    </div>
                    <FormField
                      control={phoneResetForm.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Verification code</FormLabel>
                          <FormControl>
                            <Input
                              inputMode="numeric"
                              maxLength={6}
                              autoComplete="one-time-code"
                              placeholder="123456"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={phoneResetForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New password</FormLabel>
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
                    <Button type="submit" className="w-full" disabled={phoneResetForm.formState.isSubmitting}>
                      Reset password
                    </Button>
                  </div>
                </form>
              </Form>
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
