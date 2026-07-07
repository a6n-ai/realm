"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { passwordSchema } from "@realm/commons";
import { Button } from "@realm/ui/button";
import { Card, CardContent } from "@realm/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { setInitialPassword } from "./actions";

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
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 md:p-8">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center text-center">
                  <h1 className="text-2xl font-bold">Set your password</h1>
                  <p className="text-muted-foreground text-balance">
                    Choose a password to finish setting up your account.
                  </p>
                </div>
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
                            className="pr-10"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNew((v) => !v)}
                            aria-label={showNew ? "Hide password" : "Show password"}
                            aria-pressed={showNew}
                            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center"
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
                            className="pr-10"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm((v) => !v)}
                            aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                            aria-pressed={showConfirm}
                            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center"
                          >
                            {showConfirm ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {submitError ? <p className="text-destructive text-sm">{submitError}</p> : null}
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  Save password
                </Button>
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
    </div>
  );
}
