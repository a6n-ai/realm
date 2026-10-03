"use client";

import { AuthPanel, AuthScreen } from "@foundry/auth-ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { passwordSchema } from "@foundry/commons";
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
import { setInitialPassword } from "./actions";
import { AUTH_BUTTON, AUTH_INPUT, AuthLogo } from "@/components/auth/auth-kit";

const schema = z
  .object({
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

export function SetPasswordForm() {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirm: "" },
  });

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    const r = await setInitialPassword(values.newPassword);
    if ("error" in r) {
      setSubmitError(r.error);
      return;
    }
    // Bust the cached /dashboard RSC first (it was cached as a redirect BACK here
    // while password_set was false), THEN navigate so the gate re-runs and passes.
    router.refresh();
    router.push("/dashboard");
  }

  return (
    <AuthScreen>
      <AuthPanel art={<AuthLogo />} title="Set your password" tagline="Choose a password to finish setting up your account.">
          <Form {...form}>
            <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col gap-5">
                                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showNew ? "text" : "password"}
                            autoComplete="new-password"
                            className={`${AUTH_INPUT} pr-12`}
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNew((v) => !v)}
                            aria-label={showNew ? "Hide password" : "Show password"}
                            aria-pressed={showNew}
                            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-12 items-center justify-center"
                          >
                            {showNew ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirm ? "text" : "password"}
                            autoComplete="new-password"
                            className={`${AUTH_INPUT} pr-12`}
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm((v) => !v)}
                            aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                            aria-pressed={showConfirm}
                            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-12 items-center justify-center"
                          >
                            {showConfirm ? (
                              <EyeOffIcon className="size-4" />
                            ) : (
                              <EyeIcon className="size-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {submitError ? <p className="text-destructive text-sm">{submitError}</p> : null}
                <div className="mt-auto pt-4 sm:mt-2">
<Button type="submit" className={AUTH_BUTTON} disabled={form.formState.isSubmitting}>
                  Save password
                </Button>
</div>
              </div>
            </form>
          </Form>
      </AuthPanel>
    </AuthScreen>
  );
}
