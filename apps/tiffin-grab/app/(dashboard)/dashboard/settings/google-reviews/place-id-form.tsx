"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveGoogleReviewsPlaceId } from "./actions";

const PLACE_ID_FINDER = "https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder";

export function PlaceIdForm({ placeId, disabled }: { placeId: string; disabled: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(placeId);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await saveGoogleReviewsPlaceId(value.trim());
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      toast.success(`Connected: ${res.rating?.toFixed(1)} stars from ${res.total} reviews`);
      router.refresh();
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="place-id">Google Place ID</FieldLabel>
        <Input
          id="place-id"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ChIJ..."
          aria-invalid={error ? true : undefined}
          disabled={disabled}
        />
        <FieldDescription>
          Search your business in{" "}
          <a href={PLACE_ID_FINDER} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
            Google&apos;s Place ID Finder
          </a>{" "}
          and paste the ID it shows.
        </FieldDescription>
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      <div>
        <Button type="submit" disabled={disabled || pending || !value.trim()}>
          {pending ? "Checking with Google..." : "Save and test"}
        </Button>
      </div>
    </form>
  );
}
