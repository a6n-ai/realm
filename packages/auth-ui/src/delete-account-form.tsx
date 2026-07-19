"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@realm/ui/form";
import { Input } from "@realm/ui/input";

type Result = { error?: unknown };

/**
 * Decoupled danger-zone account deletion. The app wires `onDelete` to its
 * better-auth client. Requires re-entering the password and typing DELETE, so a
 * permanent action can't be a single misclick.
 */
export interface DeleteAccountFormProps {
  onDelete: (input: { password: string }) => Promise<Result>;
  onSuccess?: () => void;
}

const schema = z
  .object({
    password: z.string().min(1, "Enter your password to confirm"),
    confirm: z.string(),
  })
  .refine((d) => d.confirm === "DELETE", { message: "Type DELETE to confirm", path: ["confirm"] });

export function DeleteAccountForm({ onDelete, onSuccess }: DeleteAccountFormProps) {
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    const res = await onDelete({ password: values.password });
    if (res.error) {
      form.setError("password", { message: "Incorrect password, or your account can't be deleted here." });
      return;
    }
    onSuccess?.();
  }

  if (!open) {
    return (
      <Button type="button" variant="destructive" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        Delete account
      </Button>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-md gap-3">
        <p className="text-muted-foreground text-sm">
          This permanently deletes your account and cannot be undone.
        </p>
        <FormField control={form.control} name="password" render={({ field }) => (
          <FormItem>
            <FormLabel>Password</FormLabel>
            <FormControl><Input type="password" autoComplete="current-password" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="confirm" render={({ field }) => (
          <FormItem>
            <FormLabel>Type DELETE to confirm</FormLabel>
            <FormControl><Input autoComplete="off" placeholder="DELETE" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Permanently delete"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
