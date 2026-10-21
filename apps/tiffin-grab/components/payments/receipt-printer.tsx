"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { buttonClass } from "@/components/customer/kit";

export type Receipt = {
  title: string;
  subtitle: string | null;
  lines: { label: string; amount: number }[];
  total: number;
  orderRef: string;
  paidWith: string | null;
  paidAt: number;
};

type Props = {
  stage: "processing" | "printing" | "complete";
  receipt: Receipt;
  status?: string;
  action: { label: string; href: string };
  secondary?: { label: string; href: string };
  onPrinted?: () => void;
  timeZone?: string;
};

// Jagged tear along the bottom edge, drawn with clip-path so the hairline border is not needed there.
const TORN_EDGE =
  "polygon(0 0,100% 0,100% calc(100% - 8px),95% 100%,90% calc(100% - 8px),85% 100%,80% calc(100% - 8px),75% 100%,70% calc(100% - 8px),65% 100%,60% calc(100% - 8px),55% 100%,50% calc(100% - 8px),45% 100%,40% calc(100% - 8px),35% 100%,30% calc(100% - 8px),25% 100%,20% calc(100% - 8px),15% 100%,10% calc(100% - 8px),5% 100%,0 calc(100% - 8px))";

/** Easing that holds still between rows, so the paper jumps out line by line like a thermal printer. */
export const steppedEase = (rows: number) => (t: number) => Math.min(1, Math.floor(t * rows) / rows);
const PER_ROW = 0.16;

// Amounts are CAD minor units; en-CA renders "$" rather than "CA$".
const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

function Paper({ receipt, status, timeZone }: { receipt: Receipt; status: string; timeZone: string }) {
  const date = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone }).format(
    receipt.paidAt,
  );
  const money = (n: number) => cad.format(n / 100);
  return (
    <div
      className="flex flex-col gap-4 border border-border bg-card px-5 pb-6 pt-5 text-sm text-foreground tabular-nums"
      style={{ clipPath: TORN_EDGE }}
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{receipt.title}</h3>
        {receipt.subtitle ? <p className="text-xs text-muted-foreground">{receipt.subtitle}</p> : null}
      </div>
      <ul className="flex flex-col gap-2 border-y border-dashed border-border py-3">
        {receipt.lines.map((l) => (
          <li key={l.label} className="flex justify-between gap-3">
            <span>{l.label}</span>
            <span>{money(l.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between gap-3 font-semibold">
        <span>Total paid</span>
        <span>{money(receipt.total)}</span>
      </div>
      <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex justify-between gap-3">
          <dt>Order</dt>
          <dd>{receipt.orderRef}</dd>
        </div>
        {receipt.paidWith ? (
          <div className="flex justify-between gap-3">
            <dt>Paid with</dt>
            <dd>{receipt.paidWith}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt>Date</dt>
          <dd>{date}</dd>
        </div>
      </dl>
      <p className="text-xs font-medium">{status}</p>
    </div>
  );
}

export function ReceiptPrinter({
  stage,
  receipt,
  status = "Paid",
  action,
  secondary,
  onPrinted,
  timeZone = "America/Toronto",
}: Props) {
  const reduce = useReducedMotion();
  const [fed, setFed] = useState(false);
  const feeding = stage === "printing" && !reduce && !fed;
  // Title, subtitle, each line, total, three detail rows and the status line.
  const rows = receipt.lines.length + 7;

  const printed = useRef(false);
  const finish = () => {
    if (printed.current) return;
    printed.current = true;
    setFed(true);
    onPrinted?.();
  };
  // Reduced motion has no feed to wait for, so "printed" is immediate (and `feeding` is already false).
  useEffect(() => {
    if (stage === "printing" && reduce && !printed.current) {
      printed.current = true;
      onPrinted?.();
    }
  });

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-full max-w-xs">
          <div
            className="flex items-center justify-center gap-2 rounded-full border border-border bg-muted px-4 py-3 text-xs text-muted-foreground"
            role="status"
          >
            {stage === "processing" ? (
              <>
                <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                <span>Processing your order</span>
              </>
            ) : (
              <span>Receipt</span>
            )}
          </div>
          {stage !== "processing" ? (
            <div className="-mt-1 overflow-hidden px-3">
              <motion.div
                initial={stage === "printing" && !reduce && !fed ? { y: "-100%" } : false}
                animate={{ y: 0 }}
                transition={{ duration: rows * PER_ROW, ease: steppedEase(rows) }}
                onAnimationComplete={stage === "printing" ? finish : undefined}
              >
                <Paper receipt={receipt} status={status} timeZone={timeZone} />
              </motion.div>
            </div>
          ) : (
            <p className="mt-3 text-center text-xs text-muted-foreground">We&apos;ll confirm by email.</p>
          )}
        </div>
        {feeding ? null : (
          <div className="flex w-full max-w-xs flex-col items-center gap-2">
            <Link href={action.href} className={buttonClass({ variant: "primary", size: "lg", className: "w-full" })}>{action.label}</Link>
            {secondary ? (
              <Link href={secondary.href} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                {secondary.label}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
