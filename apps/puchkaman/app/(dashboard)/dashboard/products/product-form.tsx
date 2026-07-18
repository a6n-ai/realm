"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Dialog, Switch } from "radix-ui";
import { XIcon } from "lucide-react";
import type { FileDetail } from "@realm/storage/model";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductRow | null;
}) {
  const router = useRouter();
  const isNew = !product;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(productSchema), defaultValues: emptyForm() });

  useEffect(() => {
    if (open) reset(product ? rowToForm(product) : emptyForm());
  }, [open, product, reset]);

  async function onSubmit(values: FormValues) {
    try {
      if (isNew) {
        await apiFetch("/api/products", { method: "POST", body: JSON.stringify(values) });
      } else {
        await apiFetch(`/api/products/${product.publicId}`, { method: "PUT", body: JSON.stringify(values) });
      }
      onOpenChange(false);
      router.refresh();
    } catch {
      // apiFetch already toasted the error.
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(22,20,13,.55)",
            zIndex: 60,
            display: "grid",
            placeItems: "center",
            padding: 20,
            overflowY: "auto",
          }}
        >
          <Dialog.Content
            className="card"
            style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", background: "var(--white)", padding: "clamp(20px,3vw,30px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex between center" style={{ marginBottom: 20 }}>
              <Dialog.Title className="display" style={{ fontSize: "1.35rem" }}>
                {isNew ? "Add product" : "Edit product"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="icon-btn" aria-label="Close">
                  <XIcon size={16} />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} style={{ display: "grid", gap: 16 }}>
              <div className={`field ${errors.name ? "field--err" : ""}`}>
                <label htmlFor="pf-name">Name</label>
                <input id="pf-name" className="input" {...register("name")} />
                {errors.name && <span className="err-msg">{errors.name.message}</span>}
              </div>

              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className={`field ${errors.category ? "field--err" : ""}`}>
                  <label htmlFor="pf-category">Category</label>
                  <select id="pf-category" className="select" {...register("category")}>
                    {CATEGORY_IDS.map((id) => (
                      <option key={id} value={id}>
                        {CATEGORIES[id].emoji} {CATEGORIES[id].name}
                      </option>
                    ))}
                  </select>
                  {errors.category && <span className="err-msg">{errors.category.message as string}</span>}
                </div>
                <div className={`field ${errors.price ? "field--err" : ""}`}>
                  <label htmlFor="pf-price">Price ($)</label>
                  <input id="pf-price" className="input" type="number" step="0.01" min="0" {...register("price")} />
                  {errors.price && <span className="err-msg">{errors.price.message as string}</span>}
                </div>
              </div>

              <div className="field">
                <label htmlFor="pf-description">Description</label>
                <textarea id="pf-description" className="textarea" rows={3} {...register("description")} />
              </div>

              <div className="field">
                <label>Badges</label>
                <Controller
                  control={control}
                  name="tags"
                  render={({ field }) => {
                    const selected = field.value ?? [];
                    return (
                      <div className="flex" style={{ gap: 8 }}>
                        {TAG_OPTIONS.map((tag) => {
                          const active = selected.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              className={`pill ${active ? "pill--red" : ""}`}
                              style={{ cursor: "pointer", textTransform: "uppercase" }}
                              onClick={() => field.onChange(active ? selected.filter((t) => t !== tag) : [...selected, tag])}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    );
                  }}
                />
              </div>

              <div className="field">
                <label>Image</label>
                <Controller
                  control={control}
                  name="image"
                  render={({ field }) => (
                    <ImageUploader value={(field.value as FileDetail | null) ?? null} onChange={field.onChange} prefix="catalog/products" />
                  )}
                />
              </div>

              <Controller
                control={control}
                name="active"
                render={({ field }) => (
                  <label
                    className="flex between center"
                    style={{ border: "var(--border)", borderRadius: "var(--r-sm)", padding: "12px 14px", cursor: "pointer" }}
                  >
                    <span style={{ fontWeight: 700, fontSize: "0.92rem" }}>Active — shown on the public menu</span>
                    <Switch.Root
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                      className="admin-switch"
                    >
                      <Switch.Thumb className="admin-switch-thumb" />
                    </Switch.Root>
                  </label>
                )}
              />

              <div className="flex" style={{ gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="btn btn--white btn--sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--red btn--sm" disabled={isSubmitting} style={isSubmitting ? { opacity: 0.7, pointerEvents: "none" } : undefined}>
                  {isSubmitting ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function emptyForm(): FormInput {
  return { name: "", description: "", category: "trad", price: 0, image: null, tags: [], active: true };
}

function rowToForm(row: ProductRow): FormInput {
  return {
    name: row.name,
    description: row.description ?? "",
    category: row.category as FormInput["category"],
    price: row.price,
    image: (row.image as FormInput["image"]) ?? null,
    tags: (row.tags ?? []) as FormInput["tags"],
    active: row.active,
  };
}
