"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ChevronsUpDown, X } from "lucide-react";
import { SectionCard } from "@/components/ds";
import { Button } from "@realm/ui/button";
import { Badge } from "@realm/ui/badge";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@realm/ui/form";
import { Textarea } from "@realm/ui/textarea";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@realm/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@realm/ui/popover";
import { cn } from "@/lib/utils";
import { updateMyPreferences } from "@/app/(dashboard)/dashboard/account/actions";

const ALLERGEN_OPTIONS = [
  "Peanuts", "Tree nuts", "Dairy", "Eggs", "Gluten", "Soy", "Shellfish", "Fish", "Sesame",
] as const;

const dietarySchema = z.object({
  allergens: z.array(z.string()).max(20, "Too many allergens selected."),
  dietaryNotes: z.string().max(500, "Keep dietary notes under 500 characters."),
});

type DietaryValues = z.infer<typeof dietarySchema>;

function AllergensMultiselect({
  value,
  onChange,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [focusedBadge, setFocusedBadge] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  // Index of the badge to focus after a badge-initiated removal (-1 = trigger,
  // null = no retarget, e.g. removal from the dropdown). Read in a layout effect
  // once the list has re-rendered so focus never falls back to <body>.
  const pendingFocus = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const root = rootRef.current;
    if (!root) return;
    if (target < 0) {
      root.querySelector<HTMLElement>('[role="combobox"]')?.focus();
      return;
    }
    const badges = root.querySelectorAll<HTMLElement>('[role="button"]');
    (badges[target] ?? badges[badges.length - 1])?.focus();
  }, [value]);

  const add = (item: string) => {
    if (value.includes(item)) return;
    onChange([...value, item]);
    setAnnouncement(`${item} added.`);
  };

  const remove = (item: string) => {
    onChange(value.filter((v) => v !== item));
    setAnnouncement(`${item} removed.`);
    setFocusedBadge(null);
  };

  const removeViaBadge = (item: string) => {
    const idx = value.indexOf(item);
    const remainingLen = value.length - 1;
    pendingFocus.current = remainingLen === 0 ? -1 : Math.min(idx, remainingLen - 1);
    remove(item);
  };

  const toggle = (item: string) => {
    if (value.includes(item)) remove(item);
    else add(item);
  };

  const onBadgeKeyDown = (e: React.KeyboardEvent, item: string) => {
    if (e.key === "Backspace" || e.key === "Delete" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      removeViaBadge(item);
    }
  };

  const available = ALLERGEN_OPTIONS.filter((o) => !value.includes(o));

  return (
    <div ref={rootRef} className="grid gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected allergens">
          {value.map((item) => (
            <li key={item}>
              <Badge
                variant="secondary"
                tabIndex={0}
                role="button"
                aria-label={`${item}, press Backspace to remove`}
                onKeyDown={(e) => onBadgeKeyDown(e, item)}
                onFocus={() => setFocusedBadge(item)}
                onBlur={() => setFocusedBadge(null)}
                className={cn(
                  "cursor-pointer gap-1 pr-1 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  focusedBadge === item && "ring-[3px] ring-ring/50",
                )}
                onClick={() => removeViaBadge(item)}
              >
                {item}
                <X className="size-3 opacity-70" aria-hidden />
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            id={id}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            aria-expanded={open}
            className="w-full justify-between font-normal text-muted-foreground sm:w-72"
          >
            {value.length > 0 ? `${value.length} selected` : "Select allergens"}
            <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search allergens..." />
            <CommandList>
              <CommandEmpty>No allergen found.</CommandEmpty>
              <CommandGroup>
                {ALLERGEN_OPTIONS.map((item) => {
                  const selected = value.includes(item);
                  return (
                    <CommandItem
                      key={item}
                      value={item}
                      data-checked={selected}
                      aria-checked={selected}
                      onSelect={() => toggle(item)}
                    >
                      {item}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {available.length === 0 && value.length > 0 && (
        <p className="text-xs text-muted-foreground">All common allergens selected.</p>
      )}

      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

export function DietarySection({
  dietaryNotes,
  allergens,
  titleAs,
}: {
  dietaryNotes: string;
  allergens: string[];
  titleAs?: "h2" | "h3";
}) {
  const form = useForm<DietaryValues>({
    resolver: zodResolver(dietarySchema),
    defaultValues: {
      allergens: allergens ?? [],
      dietaryNotes: dietaryNotes ?? "",
    },
  });

  const { isDirty, isSubmitting } = form.formState;

  async function onSubmit(values: DietaryValues) {
    const nextAllergens = values.allergens.map((a) => a.trim()).filter(Boolean);
    const nextNotes = values.dietaryNotes.trim();
    try {
      await updateMyPreferences({ allergens: nextAllergens, dietaryNotes: nextNotes });
      toast.success("Dietary preferences saved.");
      form.reset({ allergens: nextAllergens, dietaryNotes: nextNotes });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save dietary preferences.");
    }
  }

  return (
    <section id="dietary" className="scroll-mt-24">
      <SectionCard
        variant="flat"
        titleAs={titleAs}
        title="Dietary & allergens"
        subtitle="Tell the kitchen what to avoid. Allergens are flagged on every order."
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="allergens"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Allergens</FormLabel>
                  <FormControl>
                    <AllergensMultiselect value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>
                    Pick from common allergens. Focus a tag and press Backspace to remove it.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dietaryNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dietary notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder="e.g. Vegetarian, low spice, no onion or garlic."
                    />
                  </FormControl>
                  <FormDescription>
                    Anything the kitchen should know beyond the allergens above.
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
                  "Save preferences"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </SectionCard>
    </section>
  );
}
