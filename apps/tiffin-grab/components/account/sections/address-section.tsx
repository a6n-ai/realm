"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { SectionCard } from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { Button } from "@realm/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@realm/ui/select";
import { updateMyAddress } from "@/app/(dashboard)/dashboard/account/actions";

// Radix Select forbids an empty-string item value, so a sentinel maps back to ""
// in onValueChange to let a customer clear a mis-selected province.
const NO_PROVINCE = "__none__";

const PROVINCES: { value: string; label: string }[] = [
  { value: "AB", label: "Alberta" },
  { value: "BC", label: "British Columbia" },
  { value: "MB", label: "Manitoba" },
  { value: "NB", label: "New Brunswick" },
  { value: "NL", label: "Newfoundland and Labrador" },
  { value: "NS", label: "Nova Scotia" },
  { value: "NT", label: "Northwest Territories" },
  { value: "NU", label: "Nunavut" },
  { value: "ON", label: "Ontario" },
  { value: "PE", label: "Prince Edward Island" },
  { value: "QC", label: "Quebec" },
  { value: "SK", label: "Saskatchewan" },
  { value: "YT", label: "Yukon" },
];

const addressFormSchema = z.object({
  addressLine: z.string().max(200, "Address is too long"),
  addressUnit: z.string().max(40, "Unit is too long"),
  city: z.string().max(100, "City is too long"),
  postalCode: z.string().max(12, "Postal code is too long"),
  province: z.string().max(2),
});

type AddressFormValues = z.infer<typeof addressFormSchema>;

// Single source of truth for the form grid + per-field column spans. The real
// form and the .Skeleton twin both render from these so the loading state can
// never drift from the resolved layout.
const ADDRESS_GRID = "grid gap-3 sm:grid-cols-2";
const ADDRESS_FIELDS: { name: keyof AddressFormValues; className?: string }[] = [
  { name: "addressLine", className: "sm:col-span-2" },
  { name: "addressUnit" },
  { name: "city" },
  { name: "postalCode" },
  { name: "province" },
];

export function AddressSection({
  addressLine = "",
  addressUnit = "",
  city = "",
  postalCode = "",
  province = "",
  titleAs,
}: {
  addressLine?: string;
  addressUnit?: string;
  city?: string;
  postalCode?: string;
  province?: string;
  titleAs?: "h2" | "h3";
}) {
  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: { addressLine, addressUnit, city, postalCode, province },
  });

  async function onSubmit(values: AddressFormValues) {
    const next = {
      addressLine: values.addressLine.trim(),
      addressUnit: values.addressUnit.trim(),
      city: values.city.trim(),
      postalCode: values.postalCode.trim(),
      province: values.province.trim(),
    };
    try {
      await updateMyAddress(next);
      toast.success("Delivery address saved.");
      form.reset(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save address.");
    }
  }

  const hasAddress = Boolean(addressLine || city || postalCode || province);

  return (
    <section id="address" className="scroll-mt-24">
      <SectionCard
        variant="flat"
        titleAs={titleAs}
        title="Delivery address"
        subtitle={hasAddress ? undefined : "Add a delivery address to speed up checkout."}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className={ADDRESS_GRID}
          >
            <FormField
              control={form.control}
              name="addressLine"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Street address</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="address-line1"
                      placeholder="123 Maple St"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="addressUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit / Apt</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="address-line2"
                      placeholder="Apt 4B"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input autoComplete="address-level2" placeholder="Toronto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="postalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Postal code</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="postal-code"
                      placeholder="M5V 2T6"
                      className="tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="province"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Province</FormLabel>
                  <Select
                    value={field.value || undefined}
                    onValueChange={(v) => field.onChange(v === NO_PROVINCE ? "" : v)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select province" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PROVINCE}>No province</SelectItem>
                      {PROVINCES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={!form.formState.isDirty || form.formState.isSubmitting}
                className="w-full min-w-[8rem] sm:w-auto"
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save address"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </SectionCard>
    </section>
  );
}

export function AddressSectionSkeleton({ titleAs }: { titleAs?: "h2" | "h3" }) {
  return (
    <section id="address" className="scroll-mt-24">
      <SectionCard variant="flat" titleAs={titleAs} title="Delivery address">
        <div className={ADDRESS_GRID}>
          {ADDRESS_FIELDS.map((f) => (
            <div key={f.name} className={cn("grid gap-1.5", f.className)}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </SectionCard>
    </section>
  );
};
