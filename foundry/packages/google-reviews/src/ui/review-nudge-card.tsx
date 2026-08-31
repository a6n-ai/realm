"use client";

import { StarIcon, XIcon } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@foundry/ui/button";

export function ReviewNudgeCard({
  businessName,
  reviewUrl,
  onDismiss,
}: {
  businessName: string;
  reviewUrl: string;
  /** Marks the nudge done server-side; also called on click-through. */
  onDismiss: () => Promise<void>;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
      <StarIcon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">Enjoying {businessName}?</p>
        <p className="text-muted-foreground text-sm">
          A Google review takes a minute and helps enormously.
        </p>
        <Button asChild size="sm" onClick={() => start(async () => void onDismiss())}>
          <a href={reviewUrl} target="_blank" rel="noreferrer">
            Leave a review
          </a>
        </Button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        disabled={pending}
        className="text-muted-foreground hover:text-foreground"
        onClick={() => start(async () => void onDismiss())}
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
