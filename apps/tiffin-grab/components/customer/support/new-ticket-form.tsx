"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Notice, Select, Skeleton, Textarea } from "@/components/customer/kit";
import { cn } from "@/components/customer/kit/cn";
import { makeImageThumbnail } from "@/components/ds";
import { MAX_FILES, PhotoPicker, useImageFiles } from "./parts";
import { createTicket } from "@/app/(customer)/me/support/actions";
import {
  CATEGORY_LABEL,
  SUBCATEGORIES,
  type TicketCategoryValue,
} from "@/lib/support/ticket-taxonomy";

export type { TicketCategoryValue };

const FIELDS = [
  { key: "subject", label: "Subject", control: "h-11" },
  { key: "category", label: "Category", control: "h-11" },
  { key: "subcategory", label: "Sub-category", control: "h-11" },
  { key: "order", label: "Related plan / order", control: "h-11" },
  { key: "body", label: "Message", control: "h-28" },
  { key: "photos", label: "Photos", control: "h-20" },
] as const;

// Addressed by key, not index — the list doubles as the skeleton's row spec, so
// inserting a field must not silently re-point another field's label.
const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label])) as Record<
  (typeof FIELDS)[number]["key"],
  string
>;

const NO_ORDER = "__none__";

type OrderOption = { value: string; label: string };

export function NewTicketForm({
  categories,
  orders,
  defaultOrderId,
  defaultCategory,
}: {
  categories: readonly TicketCategoryValue[];
  orders: OrderOption[];
  defaultOrderId?: string;
  defaultCategory?: TicketCategoryValue;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState("");
  // "" = nothing picked yet; the sub-category field stays hidden until a category exists.
  const [category, setCategory] = useState<TicketCategoryValue | "">(defaultCategory ?? "");
  const [subcategory, setSubcategory] = useState("");
  const [orderId, setOrderId] = useState(defaultOrderId ?? NO_ORDER);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { files, inputRef, add: addFiles, setFiles } = useImageFiles(setError);

  // Changing the category invalidates whatever sub-category was picked under the
  // previous one, so clear it rather than carry a mismatched pair to the server.
  function pickCategory(next: TicketCategoryValue) {
    setCategory(next);
    setSubcategory("");
    setError(null);
  }

  function submit() {
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    if (!trimmedSubject) return setError("Please add a short subject.");
    if (!category) return setError("Please choose a category.");
    if (!subcategory) return setError("Please choose a sub-category.");
    if (!trimmedBody) return setError("Please describe what's going on.");
    setError(null);
    start(async () => {
      try {
        const form = new FormData();
        form.set("subject", trimmedSubject);
        form.set("category", category);
        form.set("subcategory", subcategory);
        form.set("body", trimmedBody);
        if (orderId !== NO_ORDER) form.set("orderPublicId", orderId);
        for (const f of files) {
          const thumb = await makeImageThumbnail(f);
          form.append("attachment", f);
          form.append("attachment_thumb", thumb, thumb.name);
        }
        await createTicket(form);
      } catch (e) {
        // redirect() throws a special NEXT_REDIRECT — don't surface it as an error.
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError(e instanceof Error ? e.message : "Couldn't create the ticket. Please try again.");
      }
    });
  }

  return (
    <form
      className="grid w-full max-w-xl gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field id="ticket-subject" label={LABEL.subject} placeholder="e.g. Tiffin didn't arrive today" value={subject} onChange={(e) => setSubject(e.target.value)} />

      <Select
        id="ticket-category"
        label={LABEL.category}
        placeholder="Choose a category"
        options={categories.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
        value={category}
        onChange={(e) => pickCategory(e.target.value as TicketCategoryValue)}
      />

      {category ? (
        <Select
          key={category}
          id="ticket-subcategory"
          label={LABEL.subcategory}
          placeholder="Choose a sub-category"
          options={SUBCATEGORIES[category]}
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
        />
      ) : null}

      {orders.length > 0 ? (
        <Select
          id="ticket-order"
          label={LABEL.order}
          hint="Optional"
          options={[{ value: NO_ORDER, label: "None" }, ...orders]}
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        />
      ) : null}

      <Textarea id="ticket-body" label={LABEL.body} rows={5} placeholder="Tell us what happened, and anything that helps us sort it out…" value={body} onChange={(e) => setBody(e.target.value)} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ticket-photos" className="text-sm font-semibold">
          Photos or screenshots
        </label>
        <PhotoPicker id="ticket-photos" files={files} inputRef={inputRef} onAdd={addFiles} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} disabled={pending} />
        <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">Optional, up to {MAX_FILES}. PNG, JPEG, WebP or GIF, max 5 MB each. Great for delivery issues or app screenshots.</p>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" size="lg" pending={pending}>
          {pending ? "Sending…" : "Submit ticket"}
        </Button>
        <Button variant="quiet" size="lg" disabled={pending} onClick={() => router.push("/me/support")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function NewTicketFormSkeleton() {
  return (
    <div className="grid max-w-xl gap-5">
      {/* Sub-category is hidden until a category is picked, so the loading state
          mirrors the form's initial shape rather than its fully-filled one. */}
      {FIELDS.filter((f) => f.key !== "subcategory").map((f) => (
        <div key={f.key} className="grid gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className={cn("w-full", f.control)} />
        </div>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-11 w-full sm:w-36" />
        <Skeleton className="h-11 w-full sm:w-24" />
      </div>
    </div>
  );
}
