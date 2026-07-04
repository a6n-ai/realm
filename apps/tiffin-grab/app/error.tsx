"use client";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertTriangleIcon className="text-muted-foreground size-6" />
      <h1 className="text-lg font-semibold text-balance">Something went wrong</h1>
      <p className="text-muted-foreground text-sm text-pretty">This page failed to load. Try again.</p>
      {error.digest ? <p className="text-muted-foreground text-xs">Ref: {error.digest}</p> : null}
      <Button onClick={reset} className="mt-1">Try again</Button>
    </main>
  );
}
