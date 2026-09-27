"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Country as CountryCode } from "react-phone-number-input";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@foundry/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { PhoneInput } from "@foundry/ui/phone-input";
import { accountFormSchema, type AccountFormValues } from "./schema";
import { updateMyContact } from "@/app/(dashboard)/dashboard/account/actions";

export function AccountForm({ phone, email, defaultCountry }: { phone: string; email: string; defaultCountry: CountryCode }) {
  const router = useRouter();
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: { phone, email },
  });
  const { isDirty, isSubmitting } = form.formState;

  async function onSubmit(values: AccountFormValues) {
    try {
      await updateMyContact({ phone: values.phone });
      toast.success("Contact details saved.");
      form.reset(values);
      router.refresh();
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Failed to update" });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-md gap-3">
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <PhoneInput {...field} defaultCountry={defaultCountry} className="tabular-nums" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              {/* Read-only: changing it needs a code to both addresses (Security). */}
              <FormControl><Input type="email" {...field} readOnly disabled /></FormControl>
              <p className="text-muted-foreground text-xs">
                Change your email under{" "}
                <Link href="/dashboard/account/security" className="underline underline-offset-2">Security</Link>.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root && (
          <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
        )}
        <Button
          type="submit"
          disabled={!isDirty || isSubmitting}
          className="w-full min-w-32 sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving...
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </form>
    </Form>
  );
}
