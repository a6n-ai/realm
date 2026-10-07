"use client";

import { useState, useTransition } from "react";
import { makeImageThumbnail } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Textarea } from "@foundry/ui/textarea";
import { createTicket } from "@/app/(customer)/me/support/actions";
import {
  CATEGORY_LABEL,
  SUBCATEGORIES,
  type TicketCategoryValue,
} from "@/lib/support/ticket-taxonomy";
import { PhotoPicker, useImageFiles } from "./parts";

const NO_BOOKING = "__none__";

type BookingOption = { value: string; label: string };

export function NewTicketForm({
  categories,
  bookings,
  defaultBookingId,
  defaultCategory,
  onCancel,
}: {
  categories: readonly TicketCategoryValue[];
  bookings: BookingOption[];
  defaultBookingId?: string;
  defaultCategory?: TicketCategoryValue;
  onCancel?: () => void;
}) {
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategoryValue | "">(defaultCategory ?? "");
  const [subcategory, setSubcategory] = useState("");
  const [bookingId, setBookingId] = useState(defaultBookingId ?? NO_BOOKING);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { files, inputRef, add: addFiles, setFiles } = useImageFiles(setError);

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
        if (bookingId !== NO_BOOKING) form.set("bookingPublicId", bookingId);
        for (const f of files) {
          const thumb = await makeImageThumbnail(f);
          form.append("attachment", f);
          form.append("attachment_thumb", thumb, thumb.name);
        }
        await createTicket(form);
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError(e instanceof Error ? e.message : "Couldn't create the ticket. Please try again.");
      }
    });
  }

  const subs = category ? SUBCATEGORIES[category] : [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="ticket-subject">Subject</Label>
        <Input
          id="ticket-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short summary"
          disabled={pending}
        />
      </div>

      <div className="grid gap-2">
        <Label>Category</Label>
        <Select
          value={category || undefined}
          onValueChange={(v) => pickCategory(v as TicketCategoryValue)}
          disabled={pending}
        >
          <SelectTrigger>
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
        <div className="grid gap-2">
          <Label>Sub-category</Label>
          <Select value={subcategory || undefined} onValueChange={setSubcategory} disabled={pending}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a sub-category" />
            </SelectTrigger>
            <SelectContent>
              {subs.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {bookings.length > 0 ? (
        <div className="grid gap-2">
          <Label>Related booking (optional)</Label>
          <Select value={bookingId} onValueChange={setBookingId} disabled={pending}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_BOOKING}>None</SelectItem>
              {bookings.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="ticket-body">Message</Label>
        <Textarea
          id="ticket-body"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tell us what happened"
          disabled={pending}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="ticket-photos">Photos</Label>
        <PhotoPicker
          id="ticket-photos"
          files={files}
          inputRef={inputRef}
          onAdd={addFiles}
          onRemove={(i) => setFiles(files.filter((_, j) => j !== i))}
          disabled={pending}
        />
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Starting…" : "Start chat"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
