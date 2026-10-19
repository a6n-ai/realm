"use client";

import { useState, useTransition } from "react";
import { CheckIcon, PlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { createChildAction } from "@/app/(customer)/me/book/actions";
import { ageOn, checkAge } from "@/lib/children/age";
import type { ChildView, WizardSession } from "./types";

export function ChildPicker({
  kids,
  selected,
  session,
  onToggle,
  onAdded,
}: {
  kids: ChildView[];
  selected: string[];
  session: WizardSession;
  onToggle: (publicId: string) => void;
  onAdded: (child: ChildView) => void;
}) {
  const [adding, setAdding] = useState(kids.length === 0);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const full = selected.length >= session.remaining;

  const save = () =>
    start(async () => {
      setError(null);
      const res = await createChildAction({ name, dateOfBirth: dob });
      if ("error" in res) return setError(res.error);
      onAdded(res.child);
      setName("");
      setDob("");
      setAdding(false);
    });

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {kids.map((kid) => {
          const age = ageOn(kid.dateOfBirth, session.occursOn);
          const verdict = checkAge(session, age);
          const on = selected.includes(kid.publicId);
          const blocked = verdict === "blocked" || (!on && full);
          return (
            <li key={kid.publicId}>
              <button
                type="button"
                disabled={blocked}
                aria-pressed={on}
                onClick={() => onToggle(kid.publicId)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors disabled:opacity-50 ${
                  on ? "border-[var(--xl-pink-600)] bg-[var(--xl-pink-100)] dark:bg-accent" : "bg-card"
                }`}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${on ? "border-[var(--xl-pink-600)] bg-[var(--xl-pink-600)] text-white" : ""}`}
                >
                  {on ? <CheckIcon className="size-4" /> : null}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{kid.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {age} {age === 1 ? "year" : "years"} old
                    {verdict === "blocked" ? " · outside this class's age range" : ""}
                    {verdict === "waiver" ? " · outside the usual age range, a waiver applies" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {full ? (
        <p className="text-muted-foreground text-sm">
          Only {session.remaining} {session.remaining === 1 ? "place is" : "places are"} left on this session.
        </p>
      ) : null}

      {adding ? (
        <form
          className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="child-name">Child&apos;s name</Label>
            <Input id="child-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required className="h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="child-dob">Date of birth</Label>
            <Input id="child-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required className="h-11" />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="h-11 flex-1">
              {pending ? "Saving…" : "Save child"}
            </Button>
            {kids.length > 0 ? (
              <Button type="button" variant="ghost" className="h-11" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => setAdding(true)}>
          <PlusIcon className="size-4" /> Add a child
        </Button>
      )}
    </div>
  );
}
