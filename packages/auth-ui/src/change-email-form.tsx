"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@realm/ui/form";
import { Input } from "@realm/ui/input";

type Result = { error?: unknown };

/**
 * Decoupled OTP email change with current-email confirmation:
 *  1. enter new email  -> onSendCurrentOtp() emails a code to the CURRENT address
 *  2. enter that code  -> onRequestChange() verifies it and emails a code to the NEW address
 *  3. enter that code  -> onConfirmChange() switches the account email
 */
export interface ChangeEmailFormProps {
  currentEmail?: string | null;
  onSendCurrentOtp: () => Promise<Result>;
  onRequestChange: (input: { newEmail: string; otp: string }) => Promise<Result>;
  onConfirmChange: (input: { newEmail: string; otp: string }) => Promise<Result>;
  onSuccess?: () => void;
}

const emailSchema = z.object({ newEmail: z.email("Enter a valid email") });
const otpSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") });

export function ChangeEmailForm(props: ChangeEmailFormProps) {
  const [step, setStep] = useState<"email" | "current" | "new">("email");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const emailForm = useForm<z.infer<typeof emailSchema>>({ resolver: zodResolver(emailSchema), defaultValues: { newEmail: "" } });
  const currentForm = useForm<z.infer<typeof otpSchema>>({ resolver: zodResolver(otpSchema), defaultValues: { code: "" } });
  const newForm = useForm<z.infer<typeof otpSchema>>({ resolver: zodResolver(otpSchema), defaultValues: { code: "" } });

  async function startChange(values: z.infer<typeof emailSchema>) {
    setError(null);
    const res = await props.onSendCurrentOtp();
    if (res.error) { setError("Could not start the change. Try again."); return; }
    setNewEmail(values.newEmail.trim());
    setStep("current");
  }

  async function confirmCurrent(values: z.infer<typeof otpSchema>) {
    setError(null);
    const res = await props.onRequestChange({ newEmail, otp: values.code });
    if (res.error) { setError("That code is invalid or expired."); return; }
    setStep("new");
  }

  async function confirmNew(values: z.infer<typeof otpSchema>) {
    setError(null);
    const res = await props.onConfirmChange({ newEmail, otp: values.code });
    if (res.error) { setError("That code is invalid or expired."); return; }
    toast.success("Email updated.");
    props.onSuccess?.();
    setStep("email");
    emailForm.reset();
    currentForm.reset();
    newForm.reset();
  }

  const OtpStep = ({ form, onSubmit, sentTo, cta }: {
    form: ReturnType<typeof useForm<z.infer<typeof otpSchema>>>;
    onSubmit: (v: z.infer<typeof otpSchema>) => void;
    sentTo: string;
    cta: string;
  }) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-md gap-3">
        <p className="text-muted-foreground text-sm">We sent a 6-digit code to {sentTo}.</p>
        <FormField control={form.control} name="code" render={({ field }) => (
          <FormItem>
            <FormLabel>Verification code</FormLabel>
            <FormControl><Input inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="123456" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full min-w-32 sm:w-auto">
          {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : cta}
        </Button>
      </form>
    </Form>
  );

  if (step === "current") return <OtpStep form={currentForm} onSubmit={confirmCurrent} sentTo={props.currentEmail ?? "your current email"} cta="Verify" />;
  if (step === "new") return <OtpStep form={newForm} onSubmit={confirmNew} sentTo={newEmail} cta="Change email" />;

  return (
    <Form {...emailForm}>
      <form onSubmit={emailForm.handleSubmit(startChange)} className="grid max-w-md gap-3">
        <FormField control={emailForm.control} name="newEmail" render={({ field }) => (
          <FormItem>
            <FormLabel>New email address</FormLabel>
            <FormControl><Input type="email" autoComplete="email" placeholder="you@example.com" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button type="submit" disabled={emailForm.formState.isSubmitting} className="w-full min-w-32 sm:w-auto">
          {emailForm.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Change email"}
        </Button>
      </form>
    </Form>
  );
}
