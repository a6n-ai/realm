"use client";

import type { ReactNode } from "react";
import { cn } from "@realm/ui/cn";
import { Lottie } from "./lottie";
import { lottiePath, type LottieName } from "@/lib/lottie/manifest";

interface LottieEmptyStateProps {
  animation: LottieName;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

export function LottieEmptyState({ animation, title, body, action, className }: LottieEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 py-10 text-center", className)}>
      <Lottie src={lottiePath(animation)} mode="loop" label={title} className="size-40" />
      <p className="text-base font-semibold">{title}</p>
      {body ? <p className="text-muted-foreground max-w-sm text-sm">{body}</p> : null}
      {action}
    </div>
  );
}
