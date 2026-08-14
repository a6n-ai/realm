"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { FileDetail } from "@realm/storage/model";
import { ResponsiveDialog } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { Textarea } from "@realm/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@realm/ui/select";
import { Switch } from "@realm/ui/switch";
import { cn } from "@realm/ui/cn";
import { ImageUploader } from "@/components/files/image-uploader";
import { apiFetch } from "@/lib/http/api-fetch";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/menu-categories";
import { productSchema } from "@/lib/products/schema";
import type { ProductRow } from "./products-table";

const TAG_OPTIONS = ["best", "viral", "new"] as const;

// price goes through a z.preprocess (blank-string handling), which makes its
// zod *input* type `unknown` — split input/output so zodResolver's output
// (price: number) is what onSubmit receives, while the form itself carries
// the looser pre-parse input shape.
type FormInput = z.input<typeof productSchema>;
type FormValues = z.output<typeof productSchema>;

export function ProductForm({
  open,
  onOpenChange,
  product,
  canWrite = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductRow | null;
  /** Its own submit endpoint requires product:write. Absent means unfiltered — existing callers keep today's behaviour. */
  canWrite?: boolean;
}) {
  const router = useRouter();
  const isNew = !product;

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: emptyForm(),
  });

  useEffect(() => {
    if (open) form.reset(product ? rowToForm(product) : emptyForm());
  }, [open, product, form]);

  async function onSubmit(values: FormValues) {
    try {
      if (isNew) {
        await apiFetch("/api/products", { method: "POST", body: JSON.stringify(values) });
      } else {
        await apiFetch(`/api/products/${product.publicId}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
      }
      onOpenChange(false);
      router.refresh();
    } catch {
      // apiFetch already toasted the error.
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Add product" : "Edit product"}
      contentClassName="sm:max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {canWrite ? (
            <Button
              type="submit"
              form="product-form"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </div>
      }
    >
      <Form {...form}>
        <form
          id="product-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-4 px-4 py-4"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORY_IDS.map((id) => (
                        <SelectItem key={id} value={id}>
                          {CATEGORIES[id].emoji} {CATEGORIES[id].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={field.value === undefined || field.value === null ? "" : String(field.value)}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormItem>
            <FormLabel>Badges</FormLabel>
            <Controller
              control={form.control}
              name="tags"
              render={({ field }) => {
                const selected = field.value ?? [];
                return (
                  <div className="flex flex-wrap gap-2">
                    {TAG_OPTIONS.map((tag) => {
                      const active = selected.includes(tag);
                      return (
                        <Button
                          key={tag}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className="uppercase"
                          onClick={() =>
                            field.onChange(
                              active ? selected.filter((t) => t !== tag) : [...selected, tag],
                            )
                          }
                        >
                          {tag}
                        </Button>
                      );
                    })}
                  </div>
                );
              }}
            />
          </FormItem>

          <FormItem>
            <FormLabel>Image</FormLabel>
            <Controller
              control={form.control}
              name="image"
              render={({ field }) => (
                <ImageUploader
                  value={(field.value as FileDetail | null) ?? null}
                  onChange={field.onChange}
                  prefix="catalog/products"
                />
              )}
            />
          </FormItem>

          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <label
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-3",
                )}
              >
                <span className="text-sm font-medium">Active — shown on the public menu</span>
                <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
              </label>
            )}
          />

          <FormField
            control={form.control}
            name="veg"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dietary</FormLabel>
                <Select
                  value={field.value == null ? "unset" : field.value ? "veg" : "nonveg"}
                  onValueChange={(v) => field.onChange(v === "unset" ? null : v === "veg")}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {/* "Not set" is a real option, not a placeholder: the public
                        dietary filter hides unclassified items from BOTH sides
                        rather than guessing, so leaving it unset is safe. */}
                    <SelectItem value="unset">Not set</SelectItem>
                    <SelectItem value="veg">Vegetarian</SelectItem>
                    <SelectItem value="nonveg">Non-vegetarian</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <Controller
            control={form.control}
            name="featured"
            render={({ field }) => (
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-3">
                <span className="text-sm font-medium">
                  Best Selling Product — shown in Best Sellers on the home page
                </span>
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
              </label>
            )}
          />
        </form>
      </Form>
    </ResponsiveDialog>
  );
}

function emptyForm(): FormInput {
  return {
    name: "",
    description: "",
    category: "trad",
    price: 0,
    image: null,
    tags: [],
    veg: null,
    active: true,
    featured: false,
  };
}

function rowToForm(row: ProductRow): FormInput {
  return {
    name: row.name,
    description: row.description ?? "",
    category: row.category as FormInput["category"],
    price: row.price,
    image: (row.image as FormInput["image"]) ?? null,
    tags: (row.tags ?? []) as FormInput["tags"],
    veg: row.veg ?? null,
    active: row.active,
    featured: row.featured,
  };
}
