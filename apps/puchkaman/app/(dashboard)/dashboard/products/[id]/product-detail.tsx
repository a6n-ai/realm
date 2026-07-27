"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { FileDetail } from "@realm/storage/model";
import {
  ArrowLeftIcon,
  CloudDownloadIcon,
  CloudUploadIcon,
  LinkIcon,
  Loader2Icon,
} from "lucide-react";
import { SectionCard } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
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
import { CloverLinkDialog } from "@/components/admin/clover-link-dialog";
import { SyncLoadingOverlay } from "@/components/admin/sync-loading-overlay";
import { ImageUploader } from "@/components/files/image-uploader";
import { CloverColorSwatch } from "@/components/products/clover-color-swatch";
import { apiFetch } from "@/lib/http/api-fetch";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/menu-categories";
import { productSchema } from "@/lib/products/schema";

const TAG_OPTIONS = ["best", "viral", "new"] as const;
const PRICE_TYPES = ["FIXED", "VARIABLE", "PER_UNIT"] as const;

type FormInput = z.input<typeof productSchema>;
type FormValues = z.output<typeof productSchema>;

export type ProductDetailData = {
  publicId: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  image: FileDetail | null;
  tags: string[] | null;
  active: boolean;
  featured: boolean;
  source: "manual" | "uber_eats";
  syncStatus: "none" | "synced" | "update_available";
  cloverItemId: string | null;
  cloverLastSyncedAt: number | null;
  cloverSku: string | null;
  cloverCode: string | null;
  cloverAlternateName: string | null;
  cloverPriceType: string | null;
  cloverHidden: boolean | null;
  cloverAvailable: boolean | null;
  cloverAutoManage: boolean | null;
  cloverCost: number | null;
  cloverUnitName: string | null;
  cloverColorCode: string | null;
  cloverStockQty: number | null;
};

function relativeTime(ms: number | null): string {
  if (!ms) return "Never";
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ProductDetail({
  product,
  cloverEnabled,
  cloverConnected,
}: {
  product: ProductDetailData;
  /** Plugin installed — gates all Clover sync/link chrome and inventory fields. */
  cloverEnabled: boolean;
  cloverConnected: boolean;
}) {
  const router = useRouter();
  const [linkOpen, setLinkOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState<"pull" | "push" | null>(null);

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: rowToForm(product),
  });

  useEffect(() => {
    form.reset(rowToForm(product));
  }, [product, form]);

  async function onSubmit(values: FormValues) {
    try {
      // Keep public active in sync with Clover availability when both are present.
      const hidden = values.cloverHidden ?? false;
      const available = values.cloverAvailable ?? true;
      const active =
        cloverEnabled && (values.cloverHidden != null || values.cloverAvailable != null)
          ? available && !hidden
          : (values.active ?? true);

      await apiFetch(`/api/products/${product.publicId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...values,
          active,
          ...(cloverEnabled
            ? {
                cloverHidden: values.cloverHidden ?? !active,
                cloverAvailable: values.cloverAvailable ?? active,
              }
            : {}),
        }),
      });
      router.refresh();
    } catch {
      // apiFetch already toasted.
    }
  }

  async function sync(direction: "pull" | "push") {
    setSyncBusy(direction);
    try {
      await apiFetch(`/api/products/${product.publicId}/clover-sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      router.refresh();
    } catch {
      // toasted
    } finally {
      setSyncBusy(null);
    }
  }

  const linked = Boolean(product.cloverItemId);
  const statusLabel = product.active
    ? "Active"
    : linked || product.source === "uber_eats"
      ? "Out of stock"
      : "Archived";

  const syncOverlayLabel =
    syncBusy === "pull"
      ? "Syncing product from Clover…"
      : syncBusy === "push"
        ? "Pushing product to Clover…"
        : "Syncing…";

  return (
    <div className="space-y-4">
      <SyncLoadingOverlay open={syncBusy !== null} label={syncOverlayLabel} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" asChild>
            <Link href="/dashboard/products">
              <ArrowLeftIcon className="size-3.5" />
              Products
            </Link>
          </Button>
          <Badge variant={product.active ? "secondary" : "outline"}>{statusLabel}</Badge>
          <CloverColorSwatch color={product.cloverColorCode} size={14} />
          {product.source === "uber_eats" ? <Badge variant="outline">Uber Eats</Badge> : null}
          {cloverEnabled && linked ? (
            <Badge variant="outline">Clover linked</Badge>
          ) : cloverEnabled ? (
            <Badge variant="outline" className="text-muted-foreground">
              Not linked
            </Badge>
          ) : null}
          {cloverEnabled && product.cloverLastSyncedAt ? (
            <span className="text-muted-foreground text-xs">
              Last Clover sync {relativeTime(product.cloverLastSyncedAt)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cloverEnabled ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!cloverConnected}
                onClick={() => setLinkOpen(true)}
              >
                <LinkIcon className="size-3.5" />
                {linked ? "Unlink" : "Link"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!cloverConnected || !linked || syncBusy !== null}
                onClick={() => void sync("pull")}
              >
                {syncBusy === "pull" ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <CloudDownloadIcon className="size-3.5" />
                )}
                Sync from Clover
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!cloverConnected || syncBusy !== null}
                onClick={() => void sync("push")}
              >
                {syncBusy === "push" ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <CloudUploadIcon className="size-3.5" />
                )}
                Push to Clover
              </Button>
            </>
          ) : null}
          <Button
            type="submit"
            form="product-detail-form"
            size="sm"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {cloverEnabled && linked && product.cloverItemId ? (
        <p className="text-muted-foreground font-mono text-xs">
          Clover item id: {product.cloverItemId}
        </p>
      ) : null}

      <Form {...form}>
        <form
          id="product-detail-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <SectionCard title="Catalog">
            <div className="grid gap-4">
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
                          value={
                            field.value === undefined || field.value === null
                              ? ""
                              : String(field.value)
                          }
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
                          const on = selected.includes(tag);
                          return (
                            <Button
                              key={tag}
                              type="button"
                              size="sm"
                              variant={on ? "default" : "outline"}
                              className="uppercase"
                              onClick={() =>
                                field.onChange(
                                  on ? selected.filter((t) => t !== tag) : [...selected, tag],
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
                <FormLabel>Image (Uber / local)</FormLabel>
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
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={(v) => {
                        field.onChange(v);
                        if (cloverEnabled) {
                          form.setValue("cloverHidden", !v);
                          form.setValue("cloverAvailable", v);
                        }
                      }}
                    />
                  </label>
                )}
              />

              <Controller
                control={form.control}
                name="featured"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-3">
                    <span className="text-sm font-medium">
                      Featured — shown in Best Sellers on the home page
                    </span>
                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                  </label>
                )}
              />
            </div>
          </SectionCard>

          {cloverEnabled ? (
          <SectionCard title="Clover inventory">
            <p className="text-muted-foreground mb-4 text-sm">
              Mirrored from Clover when linked. Push sends these fields to Clover; Sync from Clover
              overwrites them. Images stay local / Uber.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="cloverAlternateName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alternate name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cloverPriceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price type</FormLabel>
                    <Select
                      value={field.value ?? "FIXED"}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRICE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
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
                name="cloverSku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cloverCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cloverCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          field.value === undefined || field.value === null
                            ? ""
                            : String(field.value)
                        }
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cloverStockQty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock qty</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        value={
                          field.value === undefined || field.value === null
                            ? ""
                            : String(field.value)
                        }
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cloverUnitName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder="each, lb, oz…" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cloverColorCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color code</FormLabel>
                    <div className="flex items-center gap-2">
                      <CloverColorSwatch color={field.value} size={16} />
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="#FF0080"
                          className="flex-1"
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="mt-4 grid gap-3">
              <Controller
                control={form.control}
                name="cloverAvailable"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-3">
                    <span className="text-sm font-medium">Available (Clover)</span>
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={(v) => {
                        field.onChange(v);
                        const hidden = form.getValues("cloverHidden") ?? false;
                        form.setValue("active", v && !hidden);
                      }}
                    />
                  </label>
                )}
              />
              <Controller
                control={form.control}
                name="cloverHidden"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-3">
                    <span className="text-sm font-medium">Hidden on Register</span>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={(v) => {
                        field.onChange(v);
                        const available = form.getValues("cloverAvailable") ?? true;
                        form.setValue("active", available && !v);
                      }}
                    />
                  </label>
                )}
              />
              <Controller
                control={form.control}
                name="cloverAutoManage"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-3">
                    <span className="text-sm font-medium">
                      Auto-manage availability from stock
                    </span>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  </label>
                )}
                />
            </div>
          </SectionCard>
          ) : null}
        </form>
      </Form>

      {cloverEnabled ? (
        <CloverLinkDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          product={{
            publicId: product.publicId,
            name: product.name,
            cloverItemId: product.cloverItemId,
          }}
        />
      ) : null}
    </div>
  );
}

function rowToForm(row: ProductDetailData): FormInput {
  const priceType =
    row.cloverPriceType === "VARIABLE" || row.cloverPriceType === "PER_UNIT"
      ? row.cloverPriceType
      : row.cloverPriceType
        ? "FIXED"
        : "FIXED";
  return {
    name: row.name,
    description: row.description ?? "",
    category: row.category as FormInput["category"],
    price: row.price,
    image: (row.image as FormInput["image"]) ?? null,
    tags: (row.tags ?? []) as FormInput["tags"],
    active: row.active,
    featured: row.featured,
    cloverSku: row.cloverSku,
    cloverCode: row.cloverCode,
    cloverAlternateName: row.cloverAlternateName,
    cloverPriceType: priceType,
    cloverHidden: row.cloverHidden ?? !row.active,
    cloverAvailable: row.cloverAvailable ?? row.active,
    cloverAutoManage: row.cloverAutoManage ?? false,
    cloverCost: row.cloverCost,
    cloverUnitName: row.cloverUnitName,
    cloverColorCode: row.cloverColorCode,
    cloverStockQty: row.cloverStockQty,
  };
}
