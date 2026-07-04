"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import dynamic from "next/dynamic";
import type { Country as CountryCode } from "react-phone-number-input";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { contactFormSchema, type ContactFormValues } from "./schema";
import { createWebsiteInquiry } from "./actions";

const PhoneInput = dynamic(
  () => import("@/components/ui/phone-input").then((m) => m.PhoneInput),
  { ssr: false, loading: () => <Input disabled placeholder="Phone" /> },
);

export function ContactForm({ defaultCountry }: { defaultCountry: CountryCode }) {
  const [done, setDone] = useState<null | { waitlisted: boolean }>(null);
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema()),
    defaultValues: { fullName: "", phone: "", email: "", postalCode: "", message: "", company: "" },
  });

  async function onSubmit(values: ContactFormValues) {
    try {
      const res = await createWebsiteInquiry(values);
      setDone({ waitlisted: res.waitlisted });
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Something went wrong" });
    }
  }

  if (done) {
    return (
      <div className="card-glow rounded-lg border p-6">
        <h2 className="font-medium">Thanks — we got your message.</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {done.waitlisted
            ? "We don't serve your area just yet — you're on the waitlist and we'll reach out when we expand."
            : "Our team will be in touch shortly."}
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-lg gap-3">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
              <FormLabel>Email <span className="text-muted-foreground">(optional)</span></FormLabel>
              <FormControl><Input type="email" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="postalCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Postal code <span className="text-muted-foreground">(optional)</span></FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Honeypot: visually hidden, off the tab order; real users never fill it. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
          {...form.register("company")}
        />
        {form.formState.errors.root && (
          <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting} className="hover-lift group w-fit">
          Send message<Send className="icon-pop size-4" />
        </Button>
      </form>
    </Form>
  );
}
