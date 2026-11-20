"use client";
import { createContext, useContext, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Card, CardContent } from "@foundry/ui/card";
import { cn } from "@foundry/ui/cn";
import { initials } from "@foundry/ui/initials";
import { NextItemOpenButton } from "./open-button";
import type { RecommendationItem } from "./recommendation-grid";

export type CardRefresh = { refresh: () => void; pending: boolean };

const CardRefreshContext = createContext<CardRefresh | null>(null);

/** Dialogs and actions in a card call this after saving. Inside a card the refresh drives the card's busy state; elsewhere it refreshes the page. */
export function useCardRefresh(): CardRefresh {
  const card = useContext(CardRefreshContext);
  const router = useRouter();
  return card ?? { refresh: () => router.refresh(), pending: false };
}

function useCardRefreshState(): CardRefresh {
  const router = useRouter();
  const [pending, start] = useTransition();
  return useMemo(
    () => ({ refresh: () => start(() => router.refresh()), pending }),
    [router, pending],
  );
}

/** One recommendation: the item's header, reason, status, contact and actions, busy while its refresh runs. */
export function RecommendationCard({ item }: { item: RecommendationItem }) {
  const card = useCardRefreshState();
  return (
    <CardRefreshContext.Provider value={card}>
      <RecommendationCardFrame item={item} pending={card.pending} />
    </CardRefreshContext.Provider>
  );
}

export function RecommendationCardFrame({
  item,
  pending,
}: {
  item: RecommendationItem;
  pending: boolean;
}) {
  if (item.entity) {
    return (
      <Card
        size="sm"
        aria-busy={pending || undefined}
        className={cn("h-full justify-center", pending && "opacity-60")}
      >
        <CardContent className="flex min-w-0 items-center gap-3">
          <Avatar className="shrink-0">
            <AvatarFallback>{initials(item.name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href={item.href}
                prefetch={false}
                className="min-w-0 truncate font-medium hover:underline"
              >
                {item.name}
              </Link>
              <span className="shrink-0">{item.status}</span>
              {pending ? (
                <Loader2Icon
                  role="status"
                  aria-label="Updating"
                  className="size-4 shrink-0 animate-spin text-muted-foreground"
                />
              ) : null}
            </div>
            {item.reason ? (
              <div className="text-muted-foreground truncate text-xs">
                {item.reason}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">{item.actions}</div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card
      size="sm"
      aria-busy={pending || undefined}
      className={cn("h-full", pending && "opacity-60")}
    >
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar>
            <AvatarFallback>{initials(item.name)}</AvatarFallback>
          </Avatar>
          <Link
            href={item.href}
            prefetch={false}
            className="min-w-0 truncate font-medium hover:underline"
          >
            {item.name}
          </Link>
          {pending ? (
            <Loader2Icon
              role="status"
              aria-label="Updating"
              className="ml-auto size-4 shrink-0 animate-spin text-muted-foreground"
            />
          ) : null}
        </div>
        {item.reason || item.status ? (
          <div className="flex flex-wrap items-center gap-2">
            {item.reason}
            {item.status}
          </div>
        ) : null}
        {item.contact}
        <div className="mt-auto flex items-center gap-1">
          {item.actions}
          <NextItemOpenButton href={item.href} label="Open" />
        </div>
      </CardContent>
    </Card>
  );
}
