"use client";

import { PlusIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Country as CountryCode } from "react-phone-number-input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { matchZone } from "@/lib/catalog/postal";
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
import { Textarea } from "@/components/ui/textarea";
import { inquiryFormSchema, type InquiryFormInput, type InquiryFormValues } from "./inquiry-schema";
import { createInquiry } from "./actions";

type Src = { key: string; label: string; subs: { key: string; label: string }[] };
type Zone = { name: string; postalPrefixes: string[]; slotWindow: string; active: boolean };

/**
 * Add-inquiry flow surfaced as a slide-over Sheet. The trigger is rendered by
 * the caller (the "Add inquiry" insight card) and passed in as children so the
 * card stays a pure presentational tile.
 */
export function AddInquirySheet({
  trigger,
  defaultCountry,
  sources,
  zones,
}: {
  trigger: React.ReactNode;
  defaultCountry: CountryCode;
  sources: Src[];
  zones: Zone[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<InquiryFormInput, unknown, InquiryFormValues>({
    resolver: zodResolver(inquiryFormSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      sourceKey: sources[0]?.key ?? "manual",
      subSourceKey: "",
      planInterest: "",
      mealSizeInterest: "",
      postalCode: "",
      preferredStart: "",
      notes: "",
    },
  });

  const sourceKey = form.watch("sourceKey");
  const postal = form.watch("postalCode");
  const subs = sources.find((s) => s.key === sourceKey)?.subs ?? [];
  const zone = postal ? matchZone(postal, zones) : null;

  async function onSubmit(values: InquiryFormValues) {
    try {
      await createInquiry({
        fullName: values.fullName,
        phone: values.phone,
        email: values.email || undefined,
        sourceKey: values.sourceKey,
        subSourceKey: values.subSourceKey || undefined,
        planInterest: values.planInterest || undefined,
        mealSizeInterest: values.mealSizeInterest || undefined,
        personsInterest: values.personsInterest,
        postalCode: values.postalCode || undefined,
        preferredStart: values.preferredStart || undefined,
        quotedPrice: values.quotedPrice,
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
                    <FormLabel>Full name <span className="text-destructive">*</span></FormLabel>
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
                    <FormLabel>Phone <span className="text-destructive">*</span></FormLabel>
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
                name="sourceKey"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel>Source <span className="text-destructive">*</span></FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue("subSourceKey", "");
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sources.map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {subs.length > 0 && (
                <FormField
                  control={form.control}
                  name="subSourceKey"
                  render={({ field }) => (
                    <FormItem className="grid gap-2">
                      <FormLabel>Sub-source <span className="text-muted-foreground">(optional)</span></FormLabel>
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select sub-source" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {subs.map((sub) => (
                            <SelectItem key={sub.key} value={sub.key}>
                              {sub.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormItem className="grid gap-2">
                <FormLabel>Notes</FormLabel>
                <Textarea {...form.register("notes")} />
              </FormItem>

              <details className="border-border rounded-md border px-3 py-2 [&_summary]:cursor-pointer">
                <summary className="text-sm font-medium">Interest (optional)</summary>
                <div className="grid gap-4 pt-3">
                  <FormItem className="grid gap-2">
                    <FormLabel>Plan</FormLabel>
                    <Input {...form.register("planInterest")} />
                  </FormItem>
                  <FormItem className="grid gap-2">
                    <FormLabel>Meal size / diet</FormLabel>
                    <Input {...form.register("mealSizeInterest")} />
                  </FormItem>
                  <FormItem className="grid gap-2">
                    <FormLabel>Persons</FormLabel>
                    <Input type="number" min={1} max={20} {...form.register("personsInterest")} />
                  </FormItem>
                  <FormItem className="grid gap-2">
                    <FormLabel>Postal code</FormLabel>
                    <Input {...form.register("postalCode")} />
                    {postal ? (
                      zone ? (
                        <Badge>Zone: {zone.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Out of delivery area — waitlist</span>
                      )
                    ) : null}
                  </FormItem>
                  <FormItem className="grid gap-2">
                    <FormLabel>Preferred start</FormLabel>
                    <Input type="date" {...form.register("preferredStart")} />
                  </FormItem>
                  <FormItem className="grid gap-2">
                    <FormLabel>Quoted price</FormLabel>
                    <Input type="number" min={0} step="0.01" {...form.register("quotedPrice")} />
                  </FormItem>
                </div>
              </details>
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
