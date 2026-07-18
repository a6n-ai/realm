"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { passwordSchema } from "@realm/commons";
import { Button } from "@realm/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@realm/ui/form";
import { Input } from "@realm/ui/input";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirm: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/** Decoupled: the app supplies the actual better-auth call via `onChangePassword`. */
export interface ChangePasswordFormProps {
  onChangePassword: (input: { currentPassword: string; newPassword: string }) => Promise<{ error?: unknown }>;
}

function RevealInput({ field, show, toggle }: { field: object; show: boolean; toggle: () => void }) {
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} {...field} />
      <button
        type="button"
        className="text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 text-xs"
        onClick={toggle}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export function ChangePasswordForm({ onChangePassword }: ChangePasswordFormProps) {
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });

  async function onSubmit(values: ChangePasswordValues) {
    const { error } = await onChangePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    if (error) {
      form.setError("root", { message: "Current password is incorrect or the new password is invalid." });
      return;
    }
    toast.success("Password updated.");
    form.reset();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-md gap-3">
        <FormField control={form.control} name="currentPassword" render={({ field }) => (
          <FormItem>
            <FormLabel>Current password</FormLabel>
            <FormControl><RevealInput field={field} show={show.current} toggle={() => setShow((s) => ({ ...s, current: !s.current }))} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="newPassword" render={({ field }) => (
          <FormItem>
            <FormLabel>New password</FormLabel>
            <FormControl><RevealInput field={field} show={show.next} toggle={() => setShow((s) => ({ ...s, next: !s.next }))} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="confirm" render={({ field }) => (
          <FormItem>
            <FormLabel>Confirm new password</FormLabel>
            <FormControl><RevealInput field={field} show={show.confirm} toggle={() => setShow((s) => ({ ...s, confirm: !s.confirm }))} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        {form.formState.errors.root && <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>}
        <Button type="submit" disabled={!form.formState.isDirty || form.formState.isSubmitting} className="w-full min-w-32 sm:w-auto">
          {form.formState.isSubmitting ? (<><Loader2 className="size-4 animate-spin" aria-hidden />Saving...</>) : "Change password"}
        </Button>
      </form>
    </Form>
  );
}
