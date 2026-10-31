"use client";

import { Component, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { AlertCircleIcon, FilterXIcon, InboxIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { EmptyState } from "@/components/ds";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";

// Facet params only: the date range stays so "clear" does not change the window.
const KEEP = new Set(["from", "to", "month", "view"]);

/** Empty-state action: drops every facet filter and keeps the date range. */
export function ClearFiltersButton() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hasFacets = [...params.keys()].some((k) => !KEEP.has(k));
  if (!hasFacets) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        const next = new URLSearchParams();
        for (const [k, v] of params) if (KEEP.has(k)) next.set(k, v);
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
      }}
    >
      <FilterXIcon aria-hidden />
      Clear filters
    </Button>
  );
}

export function ChartEmpty({ message = "Nothing in this range." }: { message?: string }) {
  return <EmptyState icon={InboxIcon} message={message} action={<ClearFiltersButton />} />;
}

function ChartError({ onRetry }: { onRetry: () => void }) {
  const router = useRouter();
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden />
      <AlertTitle>Could not load this card</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>Something went wrong fetching the numbers.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onRetry();
            router.refresh();
          }}
        >
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** Class boundary: keeps one failed chart from blanking the whole tab. */
export class ChartBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <ChartError onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
