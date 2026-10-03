import type { Metadata } from "next";
import { openCode } from "@/lib/auth/magic-code";
import { CopyCode } from "./copy-code";

// Shows a live code: never prerender or cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your code", referrer: "no-referrer", robots: { index: false } };

export default async function MagicLinkPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <CopyCode code={t ? openCode(t) : null} />;
}
