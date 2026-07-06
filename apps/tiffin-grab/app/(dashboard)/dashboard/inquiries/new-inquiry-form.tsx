"use client";

import {
  ChevronDownIcon,
  HelpCircleIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Country as CountryCode } from "react-phone-number-input";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@realm/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@realm/ui/collapsible";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { cn } from "@realm/ui/cn";
import dynamic from "next/dynamic";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@realm/ui/dialog";
import { Textarea } from "@realm/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@realm/ui/tooltip";
import { inquiryFormSchema, type InquiryFormInput, type InquiryFormValues } from "./inquiry-schema";
import { createInquiry } from "./actions";
import { NoSources } from "../_leads/no-sources";
import { PostalCombobox } from "../_leads/postal-combobox";
import { useExistingCustomer } from "../_leads/use-existing-customer";

type Src = { key: string; label: string; subs: { key: string; label: string }[] };
type Zone = { name: string; postalPrefixes: string[]; slotWindow: string; active: boolean };

/** Uppercase section eyebrow. Sections are visually grouped instead of a flat field stack. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground/80 text-[0.7rem] font-semibold tracking-[0.08em] uppercase">
      {children}
    </p>
  );
}

function Req() {
  return <span className="text-primary">*</span>;
}

/**
 * Add-inquiry flow surfaced as a centered Dialog. The trigger is rendered by
 * the caller (the "Add inquiry" insight card) and passed in as children so the
 * card stays a pure presentational tile.
 */
// Heavy (~265 flag SVGs); sheet-gated, so lazy-load behind a plain skeleton.
const PhoneInput = dynamic(() => import("@realm/ui/phone-input").then((m) => m.PhoneInput), {
  ssr: false,
  loading: () => <Input disabled placeholder="Phone" />,
});

export function AddInquirySheet({
  trigger,
  open: controlledOpen,
  onOpenChange,
  defaultCountry,
  sources,
  zones,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultCountry: CountryCode;
  sources: Src[];
  zones: Zone[];
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  // FAB deep-link: /dashboard/inquiries?new=1 opens the sheet; the param is cleared on close.
  const params = useSearchParams();
  const pathname = usePathname();
  useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && params.get("new") === "1") router.replace(pathname, { scroll: false });
  };
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
  const subs = sources.find((s) => s.key === sourceKey)?.subs ?? [];
  const existingCustomer = useExistingCustomer(form.watch("phone") ?? "", form.watch("email") ?? "");

  // Live count of filled optional-interest fields, surfaced on the collapsible header.
  const interest = form.watch([
    "planInterest",
    "mealSizeInterest",
    "personsInterest",
    "postalCode",
    "preferredStart",
    "quotedPrice",
  ]);
  const interestCount = interest.filter((v) => v !== "" && v != null).length;

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
      handleOpenChange(false);
      router.refresh();
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Failed to create inquiry" });
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:border-0">
        {/* Warm header band: saffron tile anchors the action, sets the tone. */}
        <div className="border-border/70 flex items-start gap-3 border-b px-5 py-4">
          <span className="bg-primary/12 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
            <PlusIcon className="size-[18px]" />
          </span>
          <div className="grid gap-0.5">
            <DialogTitle className="text-pretty">New inquiry</DialogTitle>
            <DialogDescription>Capture a lead. It lands in the pipeline as "New".</DialogDescription>
          </div>
        </div>

        {sources.length === 0 ? (
          <NoSources noun="inquiry" />
        ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              {/* Contact */}
              <section
                className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500"
                style={{ animationDelay: "40ms" }}
              >
                <SectionLabel>Contact</SectionLabel>
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem className="grid gap-1.5">
                      <FormLabel>Full name <Req /></FormLabel>
                      <FormControl><Input autoFocus placeholder="e.g. Priya Sharma" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem className="grid gap-1.5">
                      <FormLabel>Phone <Req /></FormLabel>
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
                    <FormItem className="grid gap-1.5">
                      <FormLabel>
                        Email <span className="text-muted-foreground font-normal">optional</span>
                      </FormLabel>
                      <FormControl><Input type="email" placeholder="name@email.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              {/* Source: one-click pills for fast capture mid-call. */}
              <section
                className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500"
                style={{ animationDelay: "120ms" }}
              >
                <SectionLabel>Source</SectionLabel>
                <FormField
                  control={form.control}
                  name="sourceKey"
                  render={({ field }) => (
                    <FormItem className="grid gap-1.5">
                      <FormLabel>Where did they come from? <Req /></FormLabel>
                      <div role="radiogroup" aria-label="Source" className="flex flex-wrap gap-2">
                        {sources.map((s) => {
                          const active = field.value === s.key;
                          return (
                            <button
                              key={s.key}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => {
                                field.onChange(s.key);
                                form.setValue("subSourceKey", "");
                              }}
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]",
                                active
                                  ? "border-primary/30 bg-primary/12 text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {subs.length > 0 && (
                  <FormField
                    control={form.control}
                    name="subSourceKey"
                    render={({ field }) => (
                      <FormItem className="grid gap-1.5">
                        <FormLabel className="flex items-center gap-1.5">
                          Sub-source <span className="text-muted-foreground font-normal">optional</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" aria-label="What is a sub-source?" className="text-muted-foreground hover:text-foreground transition-colors">
                                <HelpCircleIcon className="size-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>A finer breakdown of the source, e.g. Facebook → Facebook Ads.</TooltipContent>
                          </Tooltip>
                        </FormLabel>
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
              </section>

              {/* Interest: progressive disclosure, kept out of the way until needed. */}
              <section
                className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500"
                style={{ animationDelay: "200ms" }}
              >
                <Collapsible className="border-border/70 group rounded-xl border">
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      Interest details
                      {interestCount > 0 && (
                        <span className="bg-primary/12 text-primary nums rounded-full px-1.5 py-0.5 text-[0.7rem] font-semibold">
                          {interestCount}
                        </span>
                      )}
                    </span>
                    <ChevronDownIcon className="text-muted-foreground size-4 transition-transform duration-300 group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <div className="grid gap-4 px-3.5 pt-1 pb-4 sm:grid-cols-2">
                      <FormItem className="grid gap-1.5">
                        <FormLabel>Plan</FormLabel>
                        <Input placeholder="e.g. Veg weekly" {...form.register("planInterest")} />
                      </FormItem>
                      <FormItem className="grid gap-1.5">
                        <FormLabel>Meal size / diet</FormLabel>
                        <Input placeholder="e.g. Jain, large" {...form.register("mealSizeInterest")} />
                      </FormItem>
                      <FormItem className="grid gap-1.5">
                        <FormLabel>Persons</FormLabel>
                        <Input className="nums" type="number" min={1} max={20} placeholder="1" {...form.register("personsInterest")} />
                      </FormItem>
                      <FormItem className="grid gap-1.5">
                        <FormLabel>Quoted price</FormLabel>
                        <Input className="nums" type="number" min={0} step="0.01" placeholder="0.00" {...form.register("quotedPrice")} />
                      </FormItem>
                      <FormField
                        control={form.control}
                        name="postalCode"
                        render={({ field }) => (
                          <FormItem className="grid gap-1.5 sm:col-span-2">
                            <FormLabel>Postal code</FormLabel>
                            <PostalCombobox value={field.value ?? ""} onChange={field.onChange} zones={zones} />
                          </FormItem>
                        )}
                      />
                      <FormItem className="grid gap-1.5 sm:col-span-2">
                        <FormLabel>Preferred start</FormLabel>
                        <Input type="date" {...form.register("preferredStart")} />
                      </FormItem>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>

              {/* Notes */}
              <section
                className="grid gap-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-500"
                style={{ animationDelay: "280ms" }}
              >
                <SectionLabel>Notes</SectionLabel>
                <Textarea rows={3} placeholder="Anything worth remembering from the conversation…" {...form.register("notes")} />
              </section>

              {existingCustomer && (
                <p className="text-destructive text-sm" role="alert">
                  {existingCustomer.fullName} is already a customer with this contact.
                </p>
              )}
              {form.formState.errors.root && (
                <p className="text-destructive text-sm" role="alert">{form.formState.errors.root.message}</p>
              )}
            </div>

            <DialogFooter className="border-border/70 flex-row justify-end gap-2 border-t bg-popover max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={submitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={submitting || !!existingCustomer} className="active:scale-[0.98]">
                {submitting ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                {submitting ? "Adding…" : "Add inquiry"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
