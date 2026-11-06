"use client";

import { LazyReferDemo } from "@/components/landing/stage/lazy";

/** The phone demo counts the referrer's coins in, so it needs a flat reward for them; otherwise no phone. */
export function ReferStage({ gift, earn, coins }: { gift: string | null; earn: string | null; coins: number | null }) {
  if (!earn || coins == null) return null;
  return <div className="tg-refer-stage__phone"><LazyReferDemo gift={gift} earn={earn} coins={coins} /></div>;
}
