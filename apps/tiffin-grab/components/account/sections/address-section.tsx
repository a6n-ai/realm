"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { profileAddressSchema, type ProfileAddressValues } from "@realm/commons";
import { cn } from "@realm/ui/cn";
import { SectionCard } from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { Button } from "@realm/ui/button";
import { Form } from "@realm/ui/form";
import { AddressFormFields } from "@realm/ui/address-form-fields";
import { updateMyAddress } from "@/app/(dashboard)/dashboard/account/actions";

const ADDRESS_FIELDS: { name: keyof ProfileAddressValues; className?: string }[] = [
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
  const form = useForm<ProfileAddressValues>({
    resolver: zodResolver(profileAddressSchema),
    defaultValues: { addressLine, addressUnit, city, postalCode, province },
  });

  async function onSubmit(values: ProfileAddressValues) {
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <AddressFormFields control={form.control} preset="profile" />
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
        <div className="grid gap-3 sm:grid-cols-2">
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
}
