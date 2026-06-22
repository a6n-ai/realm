"use client";

import { PlusIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Country as CountryCode } from "react-phone-number-input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { inquiryFormSchema, type InquiryFormValues } from "./inquiry-schema";
import { createInquiry } from "./actions";

const SOURCES = ["website", "facebook", "google", "manual", "referral"] as const;

/**
 * Add-inquiry flow surfaced as a slide-over Sheet. The trigger is rendered by
 * the caller (the "Add inquiry" insight card) and passed in as children so the
 * card stays a pure presentational tile.
 */
export function AddInquirySheet({ trigger, defaultCountry }: { trigger: React.ReactNode; defaultCountry: CountryCode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<InquiryFormValues>({
    resolver: zodResolver(inquiryFormSchema),
    defaultValues: { fullName: "", phone: "", email: "", source: "manual", notes: "" },
  });

  async function onSubmit(values: InquiryFormValues) {
    try {
      await createInquiry({
        fullName: values.fullName,
        phone: values.phone,
        email: values.email || undefined,
        source: values.source,
        notes: values.notes || undefined,
      });
      form.reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Failed to create inquiry" });
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PlusIcon className="size-4" />
            New inquiry
          </SheetTitle>
          <SheetDescription>Capture a lead. It lands in the pipeline as "New".</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-0 overflow-hidden">
            <div className="grid flex-1 gap-4 overflow-y-auto px-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel>Full name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
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
                  <FormItem className="grid gap-2">
                    <FormLabel>Email <span className="text-muted-foreground">(optional)</span></FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel>Source</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SOURCES.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem className="grid gap-2">
                <FormLabel>Notes</FormLabel>
                <textarea
                  className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
                  {...form.register("notes")}
                />
              </FormItem>
              {form.formState.errors.root && (
                <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
              )}
            </div>

            <SheetFooter className="flex-row justify-end gap-2">
              <SheetClose asChild>
                <Button type="button" variant="outline" disabled={form.formState.isSubmitting}>
                  Cancel
                </Button>
              </SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Adding…" : "Add inquiry"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
