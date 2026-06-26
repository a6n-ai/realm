"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Country as CountryCode } from "react-phone-number-input";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { accountFormSchema, type AccountFormValues } from "./schema";
import { updateMyContact } from "@/app/(dashboard)/dashboard/account/actions";

export function AccountForm({ phone, email, defaultCountry }: { phone: string; email: string; defaultCountry: CountryCode }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: { phone, email },
  });

  async function onSubmit(values: AccountFormValues) {
    setSaved(false);
    try {
      await updateMyContact({ phone: values.phone, email: values.email });
      setSaved(true);
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
                <PhoneInput {...field} defaultCountry={defaultCountry} />
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
              <FormControl><Input type="email" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root && (
          <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
        )}
        {saved ? <p className="text-sm text-emerald-600">Saved.</p> : null}
        <Button type="submit" disabled={form.formState.isSubmitting} className="w-fit">Save changes</Button>
      </form>
    </Form>
  );
}
