"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { FileDetail } from "@realm/storage/model";
import { CloudDownloadIcon, CloudUploadIcon, LinkIcon, Loader2Icon } from "lucide-react";
import { BackButton, SectionCard } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { RadioGroup, RadioGroupItem } from "@realm/ui/radio-group";
import { Textarea } from "@realm/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@realm/ui/select";
import { Switch } from "@realm/ui/switch";
import { CloverLinkDialog } from "@/components/admin/clover-link-dialog";
import { SyncLoadingOverlay } from "@/components/admin/sync-loading-overlay";
import { ImageUploader } from "@/components/files/image-uploader";
import { AssociationSection } from "@/components/products/association-section";
import { CloverColorSwatch, normalizeCloverColor } from "@/components/products/clover-color-swatch";
import { apiFetch } from "@/lib/http/api-fetch";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/menu-categories";
import { isEffectivelyAvailable } from "@/lib/products/availability";
import { productSchema } from "@/lib/products/schema";
import type { ProductAssociations } from "@/lib/services/inventory.service";

const TAG_OPTIONS = ["best", "viral", "new"] as const;
const PRICE_TYPES = [
  { value: "FIXED", label: "Fixed" },
  { value: "VARIABLE", label: "Variable" },
  { value: "PER_UNIT", label: "Per unit" },
] as const;
const DESCRIPTION_MAX = 1000;

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
  cloverOnlineName: string | null;
  cloverEnabledOnline: boolean | null;
  cloverAgeRestricted: boolean | null;
  cloverDefaultTaxRates: boolean | null;
  cloverIsRevenue: boolean | null;
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

/** Clover's own item form marks required fields with an asterisk. */
function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <FormLabel>
      {children}
      <span className="text-destructive ml-0.5">*</span>
    </FormLabel>
  );
}

/** Toggle row used for every boolean on the form — one shape, one rhythm. */
function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border px-3 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="text-muted-foreground block text-xs">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

export function ProductDetail({
  product,
  associations,
  associationOptions,
  cloverEnabled,
  cloverConnected,
  granted = [],
}: {
  product: ProductDetailData;
  associations: ProductAssociations;
  associationOptions: ProductAssociations;
  /** Plugin installed — gates all Clover sync/link chrome and inventory fields. */
  cloverEnabled: boolean;
  cloverConnected: boolean;
  /** Server-computed "resource:action" keys — see lib/auth/nav-permissions.ts. */
  granted?: string[];
}) {
  const router = useRouter();
  const [linkOpen, setLinkOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState<"pull" | "push" | null>(null);
  // Link/Unlink hits clover-link (product:write); Sync from/to Clover hits
  // clover-sync (product:sync) — two different permissions, not one "Clover" gate.
  const canWrite = granted.includes("product:write");
  const canSync = granted.includes("product:sync");

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
  const effectivelyAvailable = isEffectivelyAvailable(product, cloverConnected);
  const statusLabel = effectivelyAvailable
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

  const dirty = form.formState.isDirty;
  const assignDisabled = !cloverConnected;
  const assignDisabledReason = "Connect Clover under Settings → Clover first.";

  return (
    <div className="space-y-4 pb-4">
      <SyncLoadingOverlay open={syncBusy !== null} label={syncOverlayLabel} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <BackButton href="/dashboard/products" label="Products" />
          <Badge variant={effectivelyAvailable ? "secondary" : "outline"}>{statusLabel}</Badge>
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
        {cloverEnabled && (canWrite || canSync) ? (
          <div className="flex flex-wrap items-center gap-2">
            {canWrite ? (
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
            ) : null}
            {canSync ? (
              <>
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
          </div>
        ) : null}
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
          <SectionCard
            title="Details"
            subtitle="Basic item details for both the register and the website."
          >
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <RequiredLabel>Name</RequiredLabel>
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
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <RequiredLabel>Price ($)</RequiredLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="tabular-nums"
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
                {cloverEnabled ? (
                  <FormField
                    control={form.control}
                    name="cloverPriceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price type</FormLabel>
                        <Select value={field.value ?? "FIXED"} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PRICE_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website category</FormLabel>
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
                      <FormDescription>
                        Groups the item on the public menu. Clover categories are assigned below.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {cloverEnabled ? (
                  <FormField
                    control={form.control}
                    name="cloverColorCode"
                    render={({ field }) => {
                      const hex = normalizeCloverColor(field.value);
                      return (
                        <FormItem>
                          <FormLabel>Item colour</FormLabel>
                          <div className="flex items-center gap-2">
                            {/* Native colour input — no picker dependency needed. */}
                            <input
                              type="color"
                              aria-label="Pick item colour"
                              value={hex ?? "#000000"}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                              className="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                            />
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value ?? ""}
                                placeholder="None"
                                className="flex-1 font-mono"
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!field.value}
                              onClick={() => field.onChange(null)}
                            >
                              Clear
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                ) : null}
              </div>

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

              {cloverEnabled ? (
                <Controller
                  control={form.control}
                  name="cloverAgeRestricted"
                  render={({ field }) => (
                    <SwitchRow
                      label="This is an age-restricted item"
                      hint="Needs extra confirmation during fulfilment — for example alcohol."
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Online ordering"
            subtitle="What customers see on the website and the online menu."
          >
            <div className="grid gap-4">
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
                <FormDescription>
                  Photos stay local (or come from Uber Eats); Clover never overwrites them.
                </FormDescription>
              </FormItem>

              {cloverEnabled ? (
                <FormField
                  control={form.control}
                  name="cloverOnlineName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Online name</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder={product.name} />
                      </FormControl>
                      <FormDescription>
                        Overrides the register name on the online menu. Blank uses the name above.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        maxLength={DESCRIPTION_MAX}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription className="tabular-nums">
                      {(field.value ?? "").length}/{DESCRIPTION_MAX} characters
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Controller
                control={form.control}
                name="active"
                render={({ field }) => (
                  <SwitchRow
                    label="Active — shown on the public menu"
                    checked={field.value ?? true}
                    onCheckedChange={(v) => {
                      field.onChange(v);
                      if (cloverEnabled) {
                        form.setValue("cloverHidden", !v, { shouldDirty: true });
                        form.setValue("cloverAvailable", v, { shouldDirty: true });
                      }
                    }}
                  />
                )}
              />

              <Controller
                control={form.control}
                name="featured"
                render={({ field }) => (
                  <SwitchRow
                    label="Featured — shown in Best Sellers on the home page"
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                  />
                )}
              />

              {cloverEnabled ? (
                <Controller
                  control={form.control}
                  name="cloverEnabledOnline"
                  render={({ field }) => (
                    <SwitchRow
                      label="Enabled for Clover online ordering"
                      hint="Clover's own online-ordering flag. Independent of the public menu."
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              ) : null}
            </div>
          </SectionCard>

          {cloverEnabled ? (
            <>
              <SectionCard
                title="Taxes and fees"
                subtitle="Leaving this empty means no tax is applied to the item."
              >
                <Controller
                  control={form.control}
                  name="cloverDefaultTaxRates"
                  render={({ field }) => (
                    <SwitchRow
                      label="Use the merchant's default tax rates"
                      hint="When on, Clover applies its defaults and ignores the list below."
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </SectionCard>

              <AssociationSection
                productPublicId={product.publicId}
                kind="taxRates"
                title="Assigned taxes and fees"
                subtitle="Tax rates come from Clover — edit the rates under Clover → Taxes and fees."
                assignLabel="Assign taxes and fees"
                columns={["Tax name", "Tax rate"]}
                emptyMessage="No taxes assigned. Select 'Assign taxes and fees' above to begin."
                assigned={associations.taxRates}
                options={associationOptions.taxRates}
                disabled={assignDisabled}
                disabledReason={assignDisabledReason}
              />

              <AssociationSection
                productPublicId={product.publicId}
                kind="modifierGroups"
                title="Modifier groups"
                subtitle="Modifier groups are used for add-ons, options, or other customisations."
                assignLabel="Assign modifier groups"
                columns={["Modifier group", "Min–max"]}
                emptyMessage="No modifier groups assigned. Select 'Assign modifier groups' above to begin."
                assigned={associations.modifierGroups}
                options={associationOptions.modifierGroups}
                disabled={assignDisabled}
                disabledReason={assignDisabledReason}
              />

              <AssociationSection
                productPublicId={product.publicId}
                kind="categories"
                title="Clover categories"
                subtitle="Categories make items easier to find on the register and sharpen reports."
                assignLabel="Assign categories"
                columns={["Category name", "Colour"]}
                emptyMessage="No categories assigned. Select 'Assign categories' above to begin."
                assigned={associations.categories}
                options={associationOptions.categories}
                disabled={assignDisabled}
                disabledReason={assignDisabledReason}
              />

              <AssociationSection
                productPublicId={product.publicId}
                kind="printerLabels"
                title="Order printing"
                subtitle="Decide where orders for this item will be printed."
                assignLabel="Assign labels"
                columns={["Label name", "Reporting"]}
                emptyMessage="You have not assigned any labels to this item. Select 'Assign labels' above to begin."
                assigned={associations.printerLabels}
                options={associationOptions.printerLabels}
                disabled={assignDisabled}
                disabledReason={assignDisabledReason}
              />

              <SectionCard
                title="Cost"
                subtitle="Item cost enables gross profit margin in Clover reports."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="cloverCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item cost ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="tabular-nums"
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
                </div>
                <div className="mt-4">
                  <Controller
                    control={form.control}
                    name="cloverIsRevenue"
                    render={({ field }) => (
                      <SwitchRow
                        label="This is a non-revenue item"
                        hint="Excluded from revenue reporting — gift cards, deposits, and the like."
                        checked={field.value === false}
                        onCheckedChange={(v) => field.onChange(!v)}
                      />
                    )}
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Item tracking"
                subtitle="How stock and availability are managed for this item."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="cloverCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product code</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
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
                    name="cloverStockQty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stock</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.001"
                            className="tabular-nums"
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
                    name="cloverAlternateName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Alternate name (register)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="mt-4 grid gap-4">
                  <Controller
                    control={form.control}
                    name="cloverAutoManage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Availability</FormLabel>
                        <FormControl>
                          <RadioGroup
                            value={field.value ? "auto" : "manual"}
                            onValueChange={(v) => field.onChange(v === "auto")}
                            className="gap-2"
                          >
                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm">
                              <RadioGroupItem value="manual" />
                              Manually manage availability
                            </label>
                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm">
                              <RadioGroupItem value="auto" />
                              Automatically manage availability from stock
                            </label>
                          </RadioGroup>
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="cloverAvailable"
                    render={({ field }) => (
                      <SwitchRow
                        label="Available"
                        checked={field.value ?? true}
                        onCheckedChange={(v) => {
                          field.onChange(v);
                          const hidden = form.getValues("cloverHidden") ?? false;
                          form.setValue("active", v && !hidden, { shouldDirty: true });
                        }}
                      />
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="cloverHidden"
                    render={({ field }) => (
                      <SwitchRow
                        label="Hidden on register"
                        checked={field.value ?? false}
                        onCheckedChange={(v) => {
                          field.onChange(v);
                          const available = form.getValues("cloverAvailable") ?? true;
                          form.setValue("active", available && !v, { shouldDirty: true });
                        }}
                      />
                    )}
                  />
                </div>
              </SectionCard>
            </>
          ) : null}
        </form>
      </Form>

      {/* Clover keeps Cancel/Save pinned to the bottom of a long item form. */}
      <div className="bg-background/95 sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
        {dirty ? (
          <span className="text-muted-foreground mr-auto text-xs">Unsaved changes</span>
        ) : null}
        {canWrite ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={!dirty || form.formState.isSubmitting}
              onClick={() => form.reset(rowToForm(product))}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="product-detail-form"
              disabled={!dirty || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving…" : "Save"}
            </Button>
          </>
        ) : null}
      </div>

      {cloverEnabled && canWrite ? (
        <CloverLinkDialog
          key={linkOpen ? "open" : "closed"}
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
    cloverOnlineName: row.cloverOnlineName,
    cloverEnabledOnline: row.cloverEnabledOnline ?? false,
    cloverAgeRestricted: row.cloverAgeRestricted ?? false,
    cloverDefaultTaxRates: row.cloverDefaultTaxRates ?? false,
    cloverIsRevenue: row.cloverIsRevenue ?? true,
  };
}
