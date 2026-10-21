"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BottomBar, buttonClass } from "@/components/customer/kit";

type Action = { label: string; href: string };

const COPY = {
  paid: { lead: "You're all", accent: "set." },
  processing: { lead: "Payment", accent: "processing." },
  submitted: { lead: "Proof", accent: "received." },
} as const;

/** The settled-payment body shared by checkout and /me/pay: heading, the receipt, and the actions in the same bottom bar the steps use. */
export function PaidPage({ kind, subtitle, receipt, ready, primary, secondary, barClassName }: {
  kind: keyof typeof COPY;
  subtitle: string;
  receipt: ReactNode;
  /** The paper is still feeding: hold the actions back until it is out. */
  ready: boolean;
  primary: Action;
  secondary?: Action;
  barClassName?: string;
}) {
  const { lead, accent } = COPY[kind];
  return (
    <>
      <div className="flex flex-col items-center gap-6 py-4 text-center" data-testid="paid-page">
        <div>
          <h1 className="text-[34px] leading-[1.06] font-bold tracking-[-0.03em] text-balance sm:text-[40px]">
            {lead} <em className="c-accent">{accent}</em>
          </h1>
          <p className="text-muted-foreground mt-2 text-[15px] text-pretty">{subtitle}</p>
        </div>
        <div className="flex w-full justify-center">{receipt}</div>
      </div>
      {ready && (
        <BottomBar alignEnd className={barClassName}>
          {secondary && <Link href={secondary.href} className={buttonClass({ variant: "quiet", size: "lg", className: "flex-1 sm:flex-none sm:px-6" })}>{secondary.label}</Link>}
          <Link href={primary.href} className={buttonClass({ variant: "primary", size: "lg", className: "flex-1 sm:flex-none sm:px-8" })}>{primary.label}</Link>
        </BottomBar>
      )}
    </>
  );
}
