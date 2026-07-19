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

type Result = { error?: unknown };

/**
 * Decoupled OTP password reset (email or phone). The app wires each callback to
 * its better-auth client. Both channels use a 6-digit code + new password — no
 * reset links.
 */
export interface ForgotPasswordFormProps {
  onSendEmailOtp: (email: string) => Promise<Result>;
  onResetWithEmailOtp: (input: { email: string; otp: string; password: string }) => Promise<Result>;
  // Phone channel is optional — apps without a phone plugin (e.g. puchkaman)
  // omit these and the form falls back to email-only.
  onSendPhoneOtp?: (phone: string) => Promise<Result>;
  onResetWithPhoneOtp?: (input: { phone: string; otp: string; password: string }) => Promise<Result>;
  onSuccess?: () => void;
}

const requestSchema = z.object({ identifier: z.string().min(1, "Phone or email is required") });
const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  newPassword: passwordSchema,
});

export function ForgotPasswordForm(props: ForgotPasswordFormProps) {
  const supportsPhone = Boolean(props.onSendPhoneOtp && props.onResetWithPhoneOtp);
  const [step, setStep] = useState<"request" | "verify">("request");
  const [identifier, setIdentifier] = useState("");
  const [isEmail, setIsEmail] = useState(true);
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
    const id = values.identifier.trim();
    const email = supportsPhone ? id.includes("@") : true;
    // Never reveal whether the account exists — advance regardless of result.
    if (email) await props.onSendEmailOtp(id);
    else await props.onSendPhoneOtp!(id);
    setIdentifier(id);
    setIsEmail(email);
    setStep("verify");
  }

  async function onVerify(values: z.infer<typeof verifySchema>) {
    setError(null);
    const { code, newPassword } = values;
    const res = isEmail
      ? await props.onResetWithEmailOtp({ email: identifier, otp: code, password: newPassword })
      : await props.onResetWithPhoneOtp!({ phone: identifier, otp: code, password: newPassword });
    if (res.error) {
      setError("Invalid or expired code.");
      return;
    }
    props.onSuccess?.();
  }

  if (step === "verify") {
    return (
      <Form {...verifyForm}>
        <form onSubmit={verifyForm.handleSubmit(onVerify)} className="grid gap-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Enter your code</h1>
            <p className="text-muted-foreground text-sm">We sent a 6-digit code to {identifier}.</p>
          </div>
          <FormField control={verifyForm.control} name="code" render={({ field }) => (
            <FormItem>
              <FormLabel>Verification code</FormLabel>
              <FormControl><Input inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="123456" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
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
      <form onSubmit={requestForm.handleSubmit(onRequest)} className="grid gap-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-muted-foreground text-sm">
            {supportsPhone ? "Enter your phone or email — we'll send a code." : "Enter your email — we'll send a code."}
          </p>
        </div>
        <FormField control={requestForm.control} name="identifier" render={({ field }) => (
          <FormItem>
            <FormLabel>{supportsPhone ? "Phone or email" : "Email"}</FormLabel>
            <FormControl>
              <Input
                autoComplete="username"
                placeholder={supportsPhone ? "you@example.com or +1…" : "you@example.com"}
                {...field}
              />
            </FormControl>
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
