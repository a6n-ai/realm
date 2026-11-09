"use client";

import { useDebouncedAsync } from "@/lib/hooks/use-debounced-async";
import { toast } from "sonner";
import { ChevronDownIcon, HelpCircleIcon, Loader2Icon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Country as CountryCode } from "react-phone-number-input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@foundry/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@foundry/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { cn } from "@foundry/ui/cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { Textarea } from "@foundry/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";
import { formatPhone, phoneSchema } from "@foundry/commons";
import { inquiryFormSchema, type InquiryFormInput, type InquiryFormValues } from "./inquiry-schema";
import { createInquiry } from "./actions";
import { unwrapAction } from "@/lib/actions/unwrap";
import { FollowUpPicker, StatusTilePicker } from "./_leads/status-dialog";
import { NoSources } from "../_leads/no-sources";
import { useExistingCustomer } from "../_leads/use-existing-customer";
import { findInquiryMatches } from "../_leads/match-actions";
import {
  PlanInterestFields,
  type InterestCatalog,
} from "../_leads/plan-interest-fields";
import type { ZoneLike } from "@/lib/catalog/postal";
import type { SubStatus } from "@/lib/inquiries/status";
import { localStore } from "@/lib/storage";

type Src = { key: string; label: string; subs: { key: string; label: string }[] };
type Match = { publicId: string; sourceLabel: string; stage: string };

const START_STATUSES: (SubStatus | null)[] = [
  null, "no_response", "responded", "future", "persistent", "expected", "pending_payment",
];
const LAST_SOURCE_KEY = "inquiry:last-source";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{children}</p>
  );
}

const pillClass = (active: boolean) =>
  cn(
    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    active
      ? "border-primary/30 bg-primary/12 text-primary"
      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
  );

function readLastSource(): { source?: string; sub?: string } {
  return localStore.getJson(LAST_SOURCE_KEY, {});
}

/** Debounced open-lead lookup for a full phone number; carries its key so a stale hit never lingers. */
function useOpenLeadMatches(e164: string | null): Match[] {
  const found = useDebouncedAsync<Match[]>(e164, () => findInquiryMatches(e164!), 400, []);
  return found.key === e164 ? found.value : [];
}

/**
 * Quick-add inquiry: phone first, name, source (remembered), starting status, note, follow-up;
 * the rest folds under "More details". Interest uses the same catalog keys as OrderForm so convert prefills cleanly.
 * Name kept for existing callers.
 */
export function AddInquirySheet({
  trigger,
  open: controlledOpen,
  onOpenChange,
  defaultCountry,
  timeZone,
  sources,
  zones,
  catalog,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultCountry: CountryCode;
  timeZone: string;
  sources: Src[];
  zones: ZoneLike[];
  catalog: InterestCatalog;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [followUp, setFollowUp] = useState<React.ComponentProps<typeof FollowUpPicker>["value"]>(null);
  const [startStatus, setStartStatus] = useState<SubStatus | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  // Name is the first field: autofocus on open and after "Save & add another".
  const firstRef = useRef<HTMLInputElement | null>(null);

  const emptyValues = (sourceKey: string, subSourceKey = ""): InquiryFormInput => ({
    fullName: "",
    phone: "",
    email: "",
    sourceKey,
    subSourceKey,
    planInterest: "",
    mealSizeInterest: "",
    postalCode: "",
    preferredStart: "",
    notes: "",
  });

  const form = useForm<InquiryFormInput, unknown, InquiryFormValues>({
    resolver: zodResolver(inquiryFormSchema),
    defaultValues: emptyValues(sources[0]?.key ?? "manual"),
  });

  // Preselect the last-used source each time the dialog opens (per browser).
  useEffect(() => {
    if (!open) return;
    const saved = readLastSource();
    const src = sources.find((s) => s.key === saved.source);
    if (src) {
      form.setValue("sourceKey", src.key);
      form.setValue("subSourceKey", src.subs.some((x) => x.key === saved.sub) ? saved.sub! : "");
    }
  }, [open, sources, form]);

  const sourceKey = form.watch("sourceKey");
  const subs = sources.find((s) => s.key === sourceKey)?.subs ?? [];
  const phoneValue = form.watch("phone") ?? "";
  const parsedPhone = phoneSchema(defaultCountry as never).safeParse(phoneValue);
  const e164 = parsedPhone.success ? parsedPhone.data : null;
  const existingCustomer = useExistingCustomer(e164 ?? "", form.watch("email") ?? "");
  const leadMatches = useOpenLeadMatches(e164);

  const ready = (form.watch("fullName") ?? "").trim().length > 0 || phoneValue.trim().length > 0;

  function normalizePhone(raw: string) {
    const r = phoneSchema(defaultCountry as never).safeParse(raw);
    form.setValue("phone", r.success ? formatPhone(r.data) : raw.trim(), { shouldValidate: false });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFollowUp(null);
      setStartStatus(null);
      setMoreOpen(false);
      form.reset();
    }
  }

  async function submit(values: InquiryFormValues, another: boolean) {
    try {
      const res = await unwrapAction(createInquiry({
        fullName: values.fullName || undefined,
        phone: e164 ?? (values.phone || undefined),
        email: values.email || undefined,
        nextFollowUpAt: followUp?.at,
        sourceKey: values.sourceKey,
        subSourceKey: values.subSourceKey || undefined,
        subStatus: startStatus ?? undefined,
        planInterest: values.planInterest || undefined,
        mealSizeInterest: values.mealSizeInterest || undefined,
        personsInterest: values.personsInterest,
        frequencyKeyInterest: values.frequencyKeyInterest || undefined,
        eatingDaysInterest: values.eatingDaysInterest?.length ? values.eatingDaysInterest : undefined,
        postalCode: values.postalCode || undefined,
        preferredStart: values.preferredStart || undefined,
        quotedPrice: values.quotedPrice,
        notes: values.notes || undefined,
      }));
      localStore.setJson(LAST_SOURCE_KEY, { source: values.sourceKey, sub: values.subSourceKey || "" });
      toast.success(res.folded ? `Added to ${res.fullName ?? "their"} open lead` : "Lead added", {
        action: { label: "Open", onClick: () => router.push(`/dashboard/inquiries/${res.publicId}`) },
      });
      router.refresh();
      if (another) {
        form.reset(emptyValues(values.sourceKey, values.subSourceKey));
        setFollowUp(null);
        setStartStatus(null);
        setMoreOpen(false);
        firstRef.current?.focus();
      } else {
        handleOpenChange(false);
      }
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Failed to create inquiry" });
    }
  }

  const submitting = form.formState.isSubmitting;
  const blocked = submitting || !ready || !!existingCustomer;
  const save = (another: boolean) => () => void form.handleSubmit((v) => submit(v, another))();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>New inquiry</DialogTitle>
          <DialogDescription>A phone number or name is enough.</DialogDescription>
        </DialogHeader>
        {sources.length === 0 ? (
          <div className="px-6 pb-6"><NoSources noun="inquiry" /></div>
        ) : (
          <Form {...form}>
            <form
              id="new-inquiry-form"
              onSubmit={form.handleSubmit((v) => submit(v, false))}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex flex-col gap-5 overflow-y-auto px-6 py-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem className="grid gap-1.5">
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          ref={(el) => { field.ref(el); firstRef.current = el; }}
                          autoFocus
                          autoComplete="off"
                          placeholder="e.g. Priya Sharma"
                        />
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
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="tel"
                          inputMode="tel"
                          autoComplete="off"
                          placeholder="Paste or type a number"
                          onBlur={() => { field.onBlur(); normalizePhone(field.value ?? ""); }}
                          onPaste={(e) => {
                            e.preventDefault();
                            normalizePhone(e.clipboardData.getData("text"));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                      {existingCustomer && (
                        <p className="text-destructive text-xs" role="alert">
                          {existingCustomer.fullName} is already a customer with this contact.{" "}
                          <Link className="underline" href={`/dashboard/customers/${existingCustomer.publicId}`}>Open</Link>
                        </p>
                      )}
                      {leadMatches.length > 0 && (
                        <p className="text-muted-foreground text-xs" role="status">
                          Open lead already exists ({leadMatches[0].sourceLabel}) - saving adds a re-inquiry note to it.{" "}
                          <Link className="text-foreground underline" href={`/dashboard/inquiries/${leadMatches[0].publicId}`}>Open</Link>
                        </p>
                      )}
                    </FormItem>
                  )}
                />

                <section className="flex flex-col gap-2">
                  <SectionLabel>Source</SectionLabel>
                  <div role="radiogroup" aria-label="Source" className="flex flex-wrap gap-2">
                    {sources.map((s) => {
                      const active = sourceKey === s.key;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            form.setValue("sourceKey", s.key);
                            form.setValue("subSourceKey", "");
                          }}
                          className={pillClass(active)}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  {subs.length > 0 && (
                    <>
                      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        Sub-source (optional)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" aria-label="What is a sub-source?" className="hover:text-foreground transition-colors">
                              <HelpCircleIcon className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Finer breakdown of the source when you have it - skip if unknown.</TooltipContent>
                        </Tooltip>
                      </p>
                      <div role="radiogroup" aria-label="Sub-source (optional)" className="flex flex-wrap gap-2">
                        {subs.map((sub) => {
                          const active = form.watch("subSourceKey") === sub.key;
                          return (
                            <button
                              key={sub.key}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => form.setValue("subSourceKey", active ? "" : sub.key)}
                              className={pillClass(active)}
                            >
                              {sub.label}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </section>

                <section className="flex flex-col gap-2">
                  <SectionLabel>Starting status</SectionLabel>
                  <StatusTilePicker label="Starting status" value={startStatus} onChange={setStartStatus} options={START_STATUSES} />
                </section>

                <section className="flex flex-col gap-2">
                  <SectionLabel>Note</SectionLabel>
                  <Textarea
                    rows={2}
                    placeholder="Anything worth remembering from the conversation..."
                    {...form.register("notes")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !blocked) {
                        e.preventDefault();
                        save(false)();
                      }
                    }}
                  />
                </section>
                <FollowUpPicker timeZone={timeZone} value={followUp} onChange={setFollowUp} />
                <Collapsible className="border-t pt-3" open={moreOpen || !!form.formState.errors.email} onOpenChange={setMoreOpen}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="group -ml-2">
                      More details
                      <ChevronDownIcon data-icon="inline-end" className="transition-transform duration-200 ease-soft group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="flex flex-col gap-4 pt-3">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem className="grid gap-1.5">
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="name@email.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <p className="text-muted-foreground text-sm text-pretty">
                      Pick from your catalog so converting to an order doesn&apos;t ask again.
                    </p>
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
                        frequencyKeyInterest: String(form.watch("frequencyKeyInterest") ?? ""),
                        eatingDaysInterest: form.watch("eatingDaysInterest") ?? [],
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
                        if (patch.frequencyKeyInterest !== undefined) {
                          form.setValue("frequencyKeyInterest", patch.frequencyKeyInterest, { shouldDirty: true });
                        }
                        if (patch.eatingDaysInterest !== undefined) {
                          form.setValue("eatingDaysInterest", patch.eatingDaysInterest as never, { shouldDirty: true });
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
                  </CollapsibleContent>
                </Collapsible>
                {form.formState.errors.root && (
                  <p className="text-destructive text-sm" role="alert">
                    {form.formState.errors.root.message}
                  </p>
                )}
              </div>
              <DialogFooter className="border-t px-6 py-4">
                <Button type="button" variant="outline" disabled={submitting} onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="outline" disabled={blocked} onClick={save(true)}>
                  Save &amp; add another
                </Button>
                <Button type="submit" disabled={blocked}>
                  {submitting && <Loader2Icon className="animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
