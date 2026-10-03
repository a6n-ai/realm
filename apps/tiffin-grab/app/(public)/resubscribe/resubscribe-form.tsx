"use client";

import { useState, useTransition } from "react";
import { Button } from "@foundry/ui/button";
import { confirmResubscribe } from "./actions";

export function ResubscribeForm({ address, token }: { address: string; token: string }) {
  const [state, setState] = useState<"idle" | "done" | "invalid">("idle");
  const [pending, start] = useTransition();

  if (state === "done") {
    return (
      <>
        <h1 className="text-2xl font-bold tracking-tight">You&apos;re subscribed again</h1>
        <p className="mt-3 text-muted-foreground">TiffinGrab emails to {address} will start arriving again.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Get TiffinGrab emails again?</h1>
      <p className="mt-3 text-muted-foreground">
        {address} unsubscribed earlier. Confirm to start getting menu reminders and news from TiffinGrab again.
      </p>
      {state === "invalid" && (
        <p className="mt-3 text-sm text-destructive">This link is not valid. Ask us for a new one.</p>
      )}
      <Button
        className="mt-6"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setState((await confirmResubscribe(address, token)) ? "done" : "invalid");
          })
        }
      >
        Yes, subscribe me
      </Button>
    </>
  );
}
