"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { passwordSchema } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { CodeOtp } from "./code-otp";

type Result = { error?: unknown };

export interface ForgotCurrentPasswordProps {
  /** The signed-in account's email. Shown, never typed — this is not a lookup. */
  email: string;
  onSendEmailOtp: (email: string) => Promise<Result>;
  onResetWithEmailOtp: (input: { email: string; otp: string; password: string }) => Promise<Result>;
  onDone: () => void;
}

const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  newPassword: passwordSchema,
});

/**
 * Password reset for someone already signed in who cannot produce their current
 * password.
 *
 * The emailed code is the whole point: the session alone must never be enough to
 * set a new password, or a borrowed session becomes permanent account takeover —
 * and since both apps revoke other sessions on reset, the real owner is the one
 * locked out. The code proves mailbox control, which the cookie does not.
 *
 * Separate from `ForgotPasswordForm` (the logged-out screen) because that one
 * owns the page: it renders an `h1` and asks who you are. Here the account is
 * already known and this sits inside a settings card.
 */
export function ForgotCurrentPassword(props: ForgotCurrentPasswordProps) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof verifySchema>>({
    resolver: zodResolver(verifySchema),
    defaultValues: { code: "", newPassword: "" },
  });

  async function send() {
    setSending(true);
    setError(null);
    await props.onSendEmailOtp(props.email);
    setSending(false);
    setSent(true);
  }

  async function onVerify(values: z.infer<typeof verifySchema>) {
    setError(null);
    const res = await props.onResetWithEmailOtp({
      email: props.email,
      otp: values.code,
      password: values.newPassword,
    });
    if (res.error) {
      setError("Invalid or expired code.");
      return;
    }
    toast.success("Password updated.");
    props.onDone();
  }

  if (!sent) {
    return (
      <div className="grid max-w-md gap-3">
        <p className="text-muted-foreground text-sm">
          We&apos;ll email a 6-digit code to <span className="font-medium">{props.email}</span>. Enter
          it here with your new password — you&apos;ll stay signed in on this device.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={send} disabled={sending} className="min-w-32">
            {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Email me a code"}
          </Button>
          <Button type="button" variant="ghost" onClick={props.onDone}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      {/* key forces a remount across the step swap — a reused input's native
          value-tracker can desync from the segmented OTP field's controlled value. */}
      <form key="verify" onSubmit={form.handleSubmit(onVerify)} className="grid max-w-md gap-3">
        <p className="text-muted-foreground text-sm">
          We sent a 6-digit code to <span className="font-medium">{props.email}</span>.
        </p>
        <FormField
          control={form.control}
          name="code"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Verification code</FormLabel>
              <FormControl>
                <CodeOtp value={field.value} onChange={field.onChange} aria-invalid={!!fieldState.error} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting} className="min-w-32">
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Set new password"
            )}
          </Button>
          <Button type="button" variant="ghost" onClick={send} disabled={sending}>
            Resend code
          </Button>
        </div>
      </form>
    </Form>
  );
}
