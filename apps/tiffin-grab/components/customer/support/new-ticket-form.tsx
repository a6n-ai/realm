"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlusIcon, Loader2Icon, SendIcon, XIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foundry/ui/select";
import { Textarea } from "@foundry/ui/textarea";
import { Skeleton } from "@foundry/ui/skeleton";
import { cn } from "@foundry/ui/cn";
import { makeImageThumbnail } from "@/components/ds";
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
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 4;

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
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(picked)) {
      if (next.length >= MAX_FILES) {
        setError(`Attach up to ${MAX_FILES} images`);
        break;
      }
      if (!ACCEPT.includes(f.type)) {
        setError("Only PNG, JPEG, WebP or GIF images are allowed");
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError("Each image must be 5 MB or smaller");
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
  }

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
    <div className="grid w-full max-w-xl gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="ticket-subject">{LABEL.subject}</Label>
        <Input
          id="ticket-subject"
          autoFocus
          className="min-h-11"
          placeholder="e.g. Tiffin didn't arrive today"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ticket-category">{LABEL.category}</Label>
        <Select value={category || undefined} onValueChange={(v) => pickCategory(v as TicketCategoryValue)}>
          <SelectTrigger id="ticket-category" className="min-h-11 w-full">
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {category ? (
        <div className="grid gap-1.5">
          <Label htmlFor="ticket-subcategory">{LABEL.subcategory}</Label>
          {/* Keyed on category: Radix keeps internal state while mounted, so clearing
              the value on a category switch would blank the trigger instead of
              restoring the placeholder. Remounting gives a clean list + placeholder. */}
          <Select key={category} value={subcategory || undefined} onValueChange={setSubcategory}>
            <SelectTrigger id="ticket-subcategory" className="min-h-11 w-full">
              <SelectValue placeholder="Choose a sub-category" />
            </SelectTrigger>
            <SelectContent>
              {SUBCATEGORIES[category].map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {orders.length > 0 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="ticket-order">
            {LABEL.order} <span className="text-muted-foreground font-normal">optional</span>
          </Label>
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger id="ticket-order" className="min-h-11 w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ORDER}>None</SelectItem>
              {orders.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="ticket-body">{LABEL.body}</Label>
        <Textarea
          id="ticket-body"
          rows={5}
          className="min-h-28 text-base"
          placeholder="Tell us what happened, and anything that helps us sort it out…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ticket-photos">
          Photos or screenshots{" "}
          <span className="text-muted-foreground font-normal">optional · up to {MAX_FILES}</span>
        </Label>
        <input
          ref={inputRef}
          id="ticket-photos"
          type="file"
          accept={ACCEPT.join(",")}
          multiple
          // Mobile: open photo library / camera roll for screenshots
          className="sr-only"
          onChange={(e) => addFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full justify-start gap-2 sm:w-auto"
          disabled={pending || files.length >= MAX_FILES}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlusIcon className="size-4" />
          {files.length >= MAX_FILES ? "Limit reached" : "Add photos"}
        </Button>
        {files.length > 0 ? (
          <ul className="flex flex-wrap gap-2 pt-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="bg-muted flex max-w-full items-center gap-1 rounded-md border px-2 py-1.5 text-xs">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  disabled={pending}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <XIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs text-pretty">
            PNG, JPEG, WebP or GIF — max 5 MB each. Great for delivery issues or app screenshots.
          </p>
        )}
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button onClick={submit} disabled={pending} className="min-h-11 active:scale-[0.98]">
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
          {pending ? "Sending…" : "Submit ticket"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="min-h-11"
          onClick={() => router.push("/me/support")}
        >
          Cancel
        </Button>
      </div>
    </div>
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
