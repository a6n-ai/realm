"use client";

import { HelpCircleIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Country as CountryCode } from "react-phone-number-input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@realm/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { cn } from "@realm/ui/cn";
import dynamic from "next/dynamic";
import { ResponsiveDialog } from "@realm/design-system";
import { Textarea } from "@realm/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@realm/ui/tooltip";
import { inquiryFormSchema, type InquiryFormInput, type InquiryFormValues } from "./inquiry-schema";
import { createInquiry } from "./actions";
import { NoSources } from "../_leads/no-sources";
import { StepHeader } from "../_leads/step-header";
import { useExistingCustomer } from "../_leads/use-existing-customer";
import {
  PlanInterestFields,
  type InterestCatalog,
} from "../_leads/plan-interest-fields";
import type { ZoneLike } from "@/lib/catalog/postal";

type Src = { key: string; label: string; subs: { key: string; label: string }[] };

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

const PhoneInput = dynamic(() => import("@realm/ui/phone-input").then((m) => m.PhoneInput), {
  ssr: false,
  loading: () => <Input disabled placeholder="Phone" />,
});

/**
 * Two-step Add inquiry: Contact + Source → Interest (catalog plans/meals).
 * Interest uses the same catalog keys as OrderForm so convert prefills cleanly.
 */
export function AddInquirySheet({
  trigger,
  open: controlledOpen,
  onOpenChange,
  defaultCountry,
  sources,
  zones,
  catalog,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultCountry: CountryCode;
  sources: Src[];
  zones: ZoneLike[];
  catalog: InterestCatalog;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [step, setStep] = useState<1 | 2>(1);

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

  const fullName = form.watch("fullName");
  const phone = form.watch("phone");
  const email = form.watch("email") ?? "";
  const step1Ready =
    fullName.trim().length > 0 &&
    phone.trim().length > 0 &&
    email.trim().length > 0 &&
    !existingCustomer;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setStep(1);
      form.reset();
    }
  }

  async function onSubmit(values: InquiryFormValues) {
    try {
      await createInquiry({
        fullName: values.fullName,
        phone: values.phone,
        email: values.email,
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
      setStep(1);
      handleOpenChange(false);
      router.refresh();
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Failed to create inquiry" });
    }
  }

  const submitting = form.formState.isSubmitting;

  async function goNext() {
    const ok = await form.trigger(["fullName", "phone", "email", "sourceKey", "subSourceKey"]);
    if (!ok || !step1Ready) return;
    // Defer past the initiating click — swapping Continue→Add inquiry in-place can
    // retarget the same click onto the new submit control and create the lead early.
    requestAnimationFrame(() => setStep(2));
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      title="New inquiry"
      description="Capture the lead, then optional plan interest for a clean convert later."
      contentClassName="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg md:max-h-[90vh]"
      footer={
        sources.length === 0 ? undefined : (
          <div className="flex flex-row justify-between gap-2">
            {step === 1 ? (
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => handleOpenChange(false)}
                className="min-h-11 active:scale-[0.96] sm:min-h-9"
              >
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setStep(1)}
                className="min-h-11 active:scale-[0.96] sm:min-h-9"
              >
                Back
              </Button>
            )}
            {step === 1 ? (
              <Button
                type="button"
                disabled={!step1Ready}
                onClick={goNext}
                className="min-h-11 active:scale-[0.96] sm:min-h-9"
              >
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                disabled={submitting || !!existingCustomer}
                onClick={() => void form.handleSubmit(onSubmit)()}
                className="min-h-11 active:scale-[0.96] sm:min-h-9"
              >
                {submitting ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                {submitting ? "Adding…" : "Add inquiry"}
              </Button>
            )}
          </div>
        )
      }
    >
      {sources.length === 0 ? (
        <NoSources noun="inquiry" />
      ) : (
        <Form {...form}>
          <form id="new-inquiry-form" onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <StepHeader step={step} steps={["Contact", "Interest"]} />
            <div className="space-y-6 px-5 py-5">
              {step === 1 ? (
                <>
                  <section className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
                    <SectionLabel>Contact</SectionLabel>
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem className="grid gap-1.5">
                          <FormLabel>Full name <Req /></FormLabel>
                          <FormControl>
                            <Input className="min-h-11" autoFocus placeholder="e.g. Priya Sharma" {...field} />
                          </FormControl>
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
                          <FormLabel>Email <Req /></FormLabel>
                          <FormControl>
                            <Input className="min-h-11" type="email" placeholder="name@email.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </section>

                  <section className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
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
                                    "min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
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
                              Sub-source{" "}
                              <span className="text-muted-foreground font-normal">optional</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label="What is a sub-source?"
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <HelpCircleIcon className="size-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Finer breakdown of the source when you have it — skip if unknown.
                                </TooltipContent>
                              </Tooltip>
                            </FormLabel>
                            <div
                              role="radiogroup"
                              aria-label="Sub-source (optional)"
                              className="flex flex-wrap gap-2"
                            >
                              {subs.map((sub) => {
                                const active = field.value === sub.key;
                                return (
                                  <button
                                    key={sub.key}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => field.onChange(active ? "" : sub.key)}
                                    className={cn(
                                      "min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
                                      active
                                        ? "border-primary/30 bg-primary/12 text-primary"
                                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                                    )}
                                  >
                                    {sub.label}
                                  </button>
                                );
                              })}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </section>
                </>
              ) : (
                <>
                  <section className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
                    <div className="space-y-1">
                      <SectionLabel>Interest</SectionLabel>
                      <p className="text-muted-foreground text-sm text-pretty">
                        Optional — pick from your catalog so converting to an order doesn&apos;t ask again.
                      </p>
                    </div>
                    <PlanInterestFields
                      catalog={catalog}
                      zones={zones}
                      values={{
                        planInterest: String(form.watch("planInterest") ?? ""),
                        mealSizeInterest: String(form.watch("mealSizeInterest") ?? ""),
                        personsInterest: (() => {
                          const v = form.watch("personsInterest");
                          return typeof v === "number" ? v : "";
                        })(),
                        postalCode: String(form.watch("postalCode") ?? ""),
                        preferredStart: String(form.watch("preferredStart") ?? ""),
                        quotedPrice: (() => {
                          const v = form.watch("quotedPrice");
                          return typeof v === "number" ? v : "";
                        })(),
                      }}
                      onChange={(patch) => {
                        if (patch.planInterest !== undefined) {
                          form.setValue("planInterest", patch.planInterest || "", { shouldDirty: true });
                        }
                        if (patch.mealSizeInterest !== undefined) {
                          form.setValue("mealSizeInterest", patch.mealSizeInterest || "", {
                            shouldDirty: true,
                          });
                        }
                        if (patch.personsInterest !== undefined) {
                          form.setValue(
                            "personsInterest",
                            patch.personsInterest === "" ? undefined : patch.personsInterest,
                            { shouldDirty: true },
                          );
                        }
                        if (patch.postalCode !== undefined) {
                          form.setValue("postalCode", patch.postalCode, { shouldDirty: true });
                        }
                        if (patch.preferredStart !== undefined) {
                          form.setValue("preferredStart", patch.preferredStart, { shouldDirty: true });
                        }
                        if (patch.quotedPrice !== undefined) {
                          form.setValue(
                            "quotedPrice",
                            patch.quotedPrice === "" ? undefined : patch.quotedPrice,
                            { shouldDirty: true },
                          );
                        }
                      }}
                    />
                  </section>

                  <section className="grid gap-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
                    <SectionLabel>Notes</SectionLabel>
                    <Textarea
                      rows={3}
                      placeholder="Anything worth remembering from the conversation…"
                      {...form.register("notes")}
                    />
                  </section>
                </>
              )}

              {existingCustomer && (
                <p className="text-destructive text-sm" role="alert">
                  {existingCustomer.fullName} is already a customer with this contact.
                </p>
              )}
              {form.formState.errors.root && (
                <p className="text-destructive text-sm" role="alert">
                  {form.formState.errors.root.message}
                </p>
              )}
            </div>
          </form>
        </Form>
      )}
    </ResponsiveDialog>
  );
}
