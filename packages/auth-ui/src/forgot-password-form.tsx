"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { passwordSchema } from "@realm/commons";
import { Button } from "@realm/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { CodeOtp } from "./code-otp";

type Result = { error?: unknown };

/**
 * Email-only OTP password reset. The app wires each callback to its
 * better-auth client. A 6-digit code + new password — no reset links.
 */
export interface ForgotPasswordFormProps {
  onSendEmailOtp: (email: string) => Promise<Result>;
  onResetWithEmailOtp: (input: { email: string; otp: string; password: string }) => Promise<Result>;
  onSuccess?: () => void;
}

const requestSchema = z.object({ identifier: z.email("Enter a valid email") });
const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  newPassword: passwordSchema,
});

export function ForgotPasswordForm(props: ForgotPasswordFormProps) {
  const [step, setStep] = useState<"request" | "verify">("request");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);

  const requestForm = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: { identifier: "" },
  });
  const verifyForm = useForm<z.infer<typeof verifySchema>>({
    resolver: zodResolver(verifySchema),
    defaultValues: { code: "", newPassword: "" },
  });

  async function onRequest(values: z.infer<typeof requestSchema>) {
    setError(null);
    const email = values.identifier.trim();
    // Never reveal whether the account exists — advance regardless of result.
    await props.onSendEmailOtp(email);
    setIdentifier(email);
    setStep("verify");
  }

  async function onVerify(values: z.infer<typeof verifySchema>) {
    setError(null);
    const { code, newPassword } = values;
    const res = await props.onResetWithEmailOtp({ email: identifier, otp: code, password: newPassword });
    if (res.error) {
      setError("Invalid or expired code.");
      return;
    }
    props.onSuccess?.();
  }

  if (step === "verify") {
    return (
      <Form {...verifyForm}>
        {/* key forces a remount across the step swap — otherwise React reuses the
            prior step's <form>/<input> DOM nodes, and the reused input's native
            value-tracker can desync from the segmented OTP field's controlled value. */}
        <form key="verify" onSubmit={verifyForm.handleSubmit(onVerify)} className="grid gap-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Enter your code</h1>
            <p className="text-muted-foreground text-sm">We sent a 6-digit code to {identifier}.</p>
          </div>
          <FormField
            control={verifyForm.control}
            name="code"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Verification code</FormLabel>
                <FormControl>
                  <CodeOtp
                    value={field.value}
                    onChange={field.onChange}
                    onComplete={() => verifyForm.handleSubmit(onVerify)()}
                    aria-invalid={!!fieldState.error}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField control={verifyForm.control} name="newPassword" render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={verifyForm.formState.isSubmitting}>
            {verifyForm.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Reset password"}
          </Button>
        </form>
      </Form>
    );
  }

  return (
    <Form {...requestForm}>
      <form key="request" onSubmit={requestForm.handleSubmit(onRequest)} className="grid gap-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-muted-foreground text-sm">Enter your email — we'll send a code.</p>
        </div>
        <FormField control={requestForm.control} name="identifier" render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl><Input type="email" autoComplete="username" placeholder="you@example.com" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" className="w-full" disabled={requestForm.formState.isSubmitting}>
          {requestForm.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Send code"}
        </Button>
      </form>
    </Form>
  );
}
