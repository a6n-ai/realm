"use client";

import { useActionState, useState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Textarea } from "@foundry/ui/textarea";
import { ATTENDANCE_LABELS, CATEGORY_LABELS } from "@/lib/sessions/format";
import { ATTENDANCE_MODES, SESSION_CATEGORIES } from "@/db/schema/studio";
import { createClassAction, updateClassAction, type ClassFormState } from "./class-actions";
import { ClassPhotosField } from "./class-photos";

export type ClassFormValues = {
  title: string;
  category: string;
  description: string;
  capacity: number;
  location: string;
  attendanceMode: string;
  published: boolean;
  photos: string[];
};

const empty: ClassFormValues = {
  title: "",
  category: "kids",
  description: "",
  capacity: 8,
  location: "",
  attendanceMode: "either",
  published: false,
  photos: [],
};

export function ClassForm({
  publicId,
  values,
  timeZone,
  readOnly,
}: {
  publicId?: string;
  values?: Partial<ClassFormValues>;
  timeZone: string;
  readOnly?: boolean;
}) {
  const initial = { ...empty, ...values };
  const [category, setCategory] = useState(initial.category);
  const [attendanceMode, setAttendanceMode] = useState(initial.attendanceMode);
  const action = publicId ? updateClassAction.bind(null, publicId) : createClassAction;
  const [state, formAction, pending] = useActionState<ClassFormState, FormData>(action, {});

  return (
    <form action={formAction} className="grid max-w-2xl gap-5">
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Schedule days from Sessions — this form is the class catalog.
      </p>
      <div className="grid gap-2">
        <Label htmlFor="title">Name</Label>
        <Input id="title" name="title" required defaultValue={initial.title} disabled={readOnly} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={4} defaultValue={initial.description} disabled={readOnly} />
      </div>
      <ClassPhotosField value={initial.photos} disabled={readOnly} />
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
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={initial.published} disabled={readOnly} className="size-4" />
        Published on the public calendar
      </label>
      {readOnly ? null : (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : publicId ? "Save class" : "Create class"}
          </Button>
        </div>
      )}
    </form>
  );
}
