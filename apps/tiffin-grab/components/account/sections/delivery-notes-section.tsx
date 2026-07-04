"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { SectionCard } from "@/components/ds";
import { Button } from "@realm/ui/button";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@realm/ui/form";
import { Textarea } from "@realm/ui/textarea";
import { updateMyPreferences } from "@/app/(dashboard)/dashboard/account/actions";

const deliveryNotesSchema = z.object({
  deliveryNotes: z.string().max(500, "Keep delivery notes under 500 characters."),
});

type DeliveryNotesValues = z.infer<typeof deliveryNotesSchema>;

export function DeliveryNotesSection({
  deliveryNotes,
  titleAs,
}: {
  deliveryNotes: string;
  titleAs?: "h2" | "h3";
}) {
  const form = useForm<DeliveryNotesValues>({
    resolver: zodResolver(deliveryNotesSchema),
    defaultValues: { deliveryNotes: deliveryNotes ?? "" },
  });

  const { isDirty, isSubmitting } = form.formState;

  async function onSubmit(values: DeliveryNotesValues) {
    const next = values.deliveryNotes.trim();
    try {
      await updateMyPreferences({ deliveryNotes: next });
      toast.success("Delivery notes saved.");
      form.reset({ deliveryNotes: next });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save delivery notes.");
    }
  }

  return (
    <section id="delivery-notes" className="scroll-mt-24">
      <SectionCard
        variant="flat"
        titleAs={titleAs}
        title="Delivery notes"
        subtitle="Help the driver find you — gate code, drop-off spot, or a nearby landmark."
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
            <FormField
              control={form.control}
              name="deliveryNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Delivery notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder="e.g. Gate code #1234, leave at side door by the blue planter."
                    />
                  </FormControl>
                  <FormDescription>
                    Shown to the driver at drop-off. Avoid sensitive personal info.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
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
                  "Save notes"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </SectionCard>
    </section>
  );
}
