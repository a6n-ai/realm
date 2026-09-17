"use client";

import { useActionState, useState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Textarea } from "@foundry/ui/textarea";
import { ATTENDANCE_LABELS, CATEGORY_LABELS } from "@/lib/sessions/format";
import { ATTENDANCE_MODES, SESSION_CATEGORIES } from "@/db/schema/studio";
import { createSessionAction, updateSessionAction, type SessionFormState } from "./session-actions";

export type SessionFormValues = {
  title: string;
  category: string;
  description: string;
  startsAt: string;
  endsAt: string;
  audience: string;
  capacity: number;
  priceDisplay: string;
  location: string;
  attendanceMode: string;
  published: boolean;
  extraDates: string[];
};

const empty: SessionFormValues = {
  title: "",
  category: "kids",
  description: "",
  startsAt: "",
  endsAt: "",
  audience: "",
  capacity: 8,
  priceDisplay: "",
  location: "",
  attendanceMode: "either",
  published: false,
  extraDates: [],
};

export function SessionForm({
  publicId,
  values,
  timeZone,
  readOnly,
}: {
  publicId?: string;
  values?: Partial<SessionFormValues>;
  timeZone: string;
  readOnly?: boolean;
}) {
  const initial = { ...empty, ...values };
  const [category, setCategory] = useState(initial.category);
  const [attendanceMode, setAttendanceMode] = useState(initial.attendanceMode);
  const [extraDates, setExtraDates] = useState<string[]>(initial.extraDates.length ? initial.extraDates : []);
  const action = publicId ? updateSessionAction.bind(null, publicId) : createSessionAction;
  const [state, formAction, pending] = useActionState<SessionFormState, FormData>(action, {});

  return (
    <form action={formAction} className="grid max-w-2xl gap-5">
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">Times are in {timeZone.replaceAll("_", " ")}. A class is one day.</p>
      <div className="grid gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required defaultValue={initial.title} disabled={readOnly} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="category">Category</Label>
          <input type="hidden" name="category" value={category} />
          <Select value={category} onValueChange={setCategory} disabled={readOnly}>
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SESSION_CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {CATEGORY_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="attendanceMode">Stay or drop-off</Label>
          <input type="hidden" name="attendanceMode" value={attendanceMode} />
          <Select value={attendanceMode} onValueChange={setAttendanceMode} disabled={readOnly}>
            <SelectTrigger id="attendanceMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTENDANCE_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {ATTENDANCE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={4} defaultValue={initial.description} disabled={readOnly} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="startsAt">Starts</Label>
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={initial.startsAt}
            disabled={readOnly}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endsAt">Ends</Label>
          <Input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            required
            defaultValue={initial.endsAt}
            disabled={readOnly}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium">More days</p>
        <p className="text-muted-foreground text-sm">
          Same class, same times, another date. Families book each day separately.
        </p>
        {extraDates.map((date, index) => (
          <div key={`also-${index}`} className="flex items-center gap-2">
            <Input
              name="alsoOn"
              type="date"
              value={date}
              onChange={(event) => {
                const next = [...extraDates];
                next[index] = event.target.value;
                setExtraDates(next);
              }}
              disabled={readOnly}
            />
            {readOnly ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExtraDates(extraDates.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        {readOnly ? null : (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setExtraDates([...extraDates, ""])}>
            Add another day
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="audience">Age / audience</Label>
          <Input id="audience" name="audience" defaultValue={initial.audience} disabled={readOnly} placeholder="Age 6+" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="capacity">Capacity</Label>
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            required
            defaultValue={initial.capacity}
            disabled={readOnly}
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="priceDisplay">Price display</Label>
          <Input
            id="priceDisplay"
            name="priceDisplay"
            defaultValue={initial.priceDisplay}
            disabled={readOnly}
            placeholder="$35"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="location">Location / bench</Label>
          <Input
            id="location"
            name="location"
            defaultValue={initial.location}
            disabled={readOnly}
            placeholder="Bench 01"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={initial.published} disabled={readOnly} className="size-4" />
        Published on the public calendar
      </label>
      {readOnly ? null : (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : publicId ? "Save session" : "Create session"}
          </Button>
        </div>
      )}
    </form>
  );
}
