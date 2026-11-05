"use client";

import { LazyReferDemo } from "@/components/landing/stage/lazy";

/** The phone demo needs a dollar figure and a coin count; a pct or coins-only reward shows no phone. */
export function ReferStage({ gift, coins }: { gift: string | null; coins: number | null }) {
  if (!gift?.startsWith("$") || coins == null) return null;
  return <div className="tg-refer-stage__phone"><LazyReferDemo gift={gift} coins={coins} /></div>;
}
