"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";

export type SaveGoogleReviewsPlaceId = (
  placeId: string,
) => Promise<{ error?: string; rating?: number; total?: number }>;

export function GoogleReviewsSettingsPanel({
  placeId,
  apiKeyConfigured,
  onSave,
}: {
  placeId: string;
  /** False when GOOGLE_PLACES_API_KEY is missing on the server. */
  apiKeyConfigured: boolean;
  onSave: SaveGoogleReviewsPlaceId;
}) {
  const [value, setValue] = useState(placeId);
  const [result, setResult] = useState<{ rating: number; total: number } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await onSave(value.trim());
      if (res.error) {
        setResult(null);
        toast.error(res.error);
        return;
      }
      setResult(
        typeof res.rating === "number" && typeof res.total === "number"
          ? { rating: res.rating, total: res.total }
          : null,
      );
      toast.success("Google Reviews settings saved");
    });

  return (
    <div className="space-y-4">
      {!apiKeyConfigured ? (
        <p className="text-destructive text-sm">
          GOOGLE_PLACES_API_KEY is not set on the server. Reviews will not load until it is.
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="place-id">Google Place ID</Label>
        <Input
          id="place-id"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ChIJ…"
        />
        <p className="text-muted-foreground text-sm">
          Find it with Google&rsquo;s Place ID Finder for your business listing.
        </p>
      </div>

      <Button type="button" disabled={pending} onClick={save}>
        Save and test
      </Button>

      {result ? (
        <p className="text-ok text-sm">
          Connected — {result.rating.toFixed(1)}★ across {result.total} reviews.
        </p>
      ) : null}
    </div>
  );
}
