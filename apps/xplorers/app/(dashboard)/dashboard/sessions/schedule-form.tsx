"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { scheduleSessionAction, type ScheduleFormState } from "./session-actions";

export type ScheduleClassOption = {
  publicId: string;
  title: string;
  capacity: number;
  timeLabel: string;
};

export function ScheduleSessionForm({
  classes,
  defaultClassId,
  defaultDate,
}: {
  classes: ScheduleClassOption[];
  defaultClassId?: string;
  defaultDate?: string;
}) {
  const initialClass = defaultClassId && classes.some((item) => item.publicId === defaultClassId) ? defaultClassId : (classes[0]?.publicId ?? "");
  const [classPublicId, setClassPublicId] = useState(initialClass);
  const [state, formAction, pending] = useActionState<ScheduleFormState, FormData>(scheduleSessionAction, {});
  const selected = useMemo(() => classes.find((item) => item.publicId === classPublicId), [classes, classPublicId]);

  if (classes.length === 0) {
    return <p className="text-muted-foreground text-sm">Create a class first, then come back to put it on a day.</p>;
  }

  return (
    <form action={formAction} className="grid max-w-xl gap-5">
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="classPublicId">Class</Label>
        <input type="hidden" name="classPublicId" value={classPublicId} />
        <Select value={classPublicId} onValueChange={setClassPublicId}>
          <SelectTrigger id="classPublicId">
            <SelectValue placeholder="Pick a class" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((item) => (
              <SelectItem key={item.publicId} value={item.publicId}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected ? (
          <p className="text-muted-foreground text-sm">
            {selected.timeLabel} · {selected.capacity} seats
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="occursOn">Date</Label>
        <Input id="occursOn" name="occursOn" type="date" required defaultValue={defaultDate} />
      </div>
      <div>
        <Button type="submit" disabled={pending || !classPublicId}>
          {pending ? "Scheduling…" : "Schedule session"}
        </Button>
      </div>
    </form>
  );
}
