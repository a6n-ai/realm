"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { passwordSchema } from "@realm/commons";
import { Button } from "@realm/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { setInitialPassword } from "@/app/(auth)/set-password/actions";

const schema = z
  .object({ newPassword: passwordSchema, confirm: z.string() })
  .refine((d) => d.newPassword === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

type FormValues = z.infer<typeof schema>;

// OTP-only customers have no credential row yet, so this calls the same
// setInitialPassword action the forced first-login /set-password screen uses
// (no current-password prompt) instead of @realm/auth-ui's ChangePasswordForm,
// which always requires one.
export function SetPasswordForm() {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirm: "" },
  });

  async function onSubmit(values: FormValues) {
    const r = await setInitialPassword(values.newPassword);
    if ("error" in r) {
      form.setError("root", { message: r.error });
      return;
    }
    toast.success("Password set.");
    form.reset();
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-md gap-3">
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
        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root && (
          <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full min-w-32 sm:w-auto">
          {form.formState.isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving...
            </>
          ) : (
            "Set password"
          )}
        </Button>
      </form>
    </Form>
  );
}
