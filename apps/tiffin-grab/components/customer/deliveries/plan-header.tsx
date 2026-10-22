"use client";
import type { Subscription, SubscriptionWindow, TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { ORDER_STATUS_LABEL } from "@/components/ds/order-status-badge";
import Link from "next/link";
import { cn } from "@/components/customer/kit/cn";
import { buttonClass } from "@/components/customer/kit/button-class";

const HEX = /^#[0-9a-fA-F]{6}$/;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Running · to Sep 25" / "Starts Oct 26" / "Finished": tells same-sized plans apart. */
export function windowLabel(w: SubscriptionWindow | undefined, today: string): string | null {
  if (!w) return null;
  if (w.next == null) return "Finished";
  return w.first > today ? `Starts ${shortDate(w.first)}` : `Running · to ${shortDate(w.last)}`;
}

/** Renew surfaces on the plan itself this close to the last tiffin; earlier it stays in the More drawer. */
const RENEW_SOON_DAYS = 7;

const MUTED = "text-[var(--muted-foreground,#6E6558)]";
const DOT: Record<string, string> = { ok: "var(--s-delivered,#10b981)", warn: "var(--s-vac,#d98a00)", bad: "var(--s-hold,#f43f5e)" };
const TONE: Record<string, keyof typeof DOT> = { active: "ok", upcoming: "ok", paused: "ok", waitlisted: "warn", payment_review: "warn", cancelled: "bad", rejected: "bad" };

/** Greets the customer by name; the plan gets a bold size title and one summary line (status · diet · tiffins left). */
export function PlanHeader({ name, sub, counts, renew, color, actions }: {
  /** Plan-wide actions (pause days, resume all): a row at the foot of the plan box. */
  actions?: React.ReactNode;
  name?: string | null;
  sub: Subscription;
  counts: TiffinCounts;
  renew: number | null;
  color?: string;
}) {
  const dot = color ?? (sub.tagColor && HEX.test(sub.tagColor) ? sub.tagColor : null);
  const first = name?.trim().split(/\s+/)[0];
  return (
    <header className="mb-4 lg:mb-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[clamp(28px,5vw,40px)] font-bold leading-[1.1] tracking-[-0.03em]">
          {first ? <>Hi, <em className="text-[var(--primary)]">{first}.</em></> : <>Your <em className="text-[var(--primary)]">trips.</em></>}
        </h1>
      </div>
      {/* The plan sits in its own box so it reads apart from the greeting; the plan's tag colour edges it. */}
      <div
        className="mt-4 rounded-[20px] border-[1.5px] border-[var(--border)] bg-[var(--card,#fff)] px-4 py-3.5"
        style={dot ? { borderLeft: `4px solid ${dot}` } : undefined}
        data-testid="plan-card"
      >
        {/* A custom meal's name is its whole composition — too long for the title on a phone. */}
        <p className="text-[22px] font-bold leading-tight tracking-[-0.02em]" data-testid="plan-title">{sub.mealSizeCustom ? "Custom meal" : sub.mealSizeName}</p>
        {sub.mealSizeCustom && (
          <p className="mt-1 text-[15px] leading-snug text-pretty text-[var(--muted-foreground,#6E6558)]" data-testid="plan-composition">{sub.mealSizeName}</p>
        )}
        {/* One quiet line instead of a row of pills: status, diet, what's left; renew under it. */}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[15px] tabular-nums" data-testid="plan-summary">
          <span aria-hidden className="size-2 rounded-full" style={{ background: DOT[TONE[sub.displayStatus] ?? ""] ?? "var(--muted-foreground)" }} />
          <span className="font-semibold">{ORDER_STATUS_LABEL[sub.displayStatus] ?? sub.displayStatus}</span>
          {[
            <span key="diet" className="inline-flex items-center gap-1.5">{dot && <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: dot }} />}{sub.tagLabel || sub.planName}</span>,
            sub.trial ? "Trial" : null,
            sub.fullyPaused ? "All upcoming days paused" : null,
            ...(sub.addons ?? []).map((a) => `+ ${a.name}${a.qty > 1 ? ` ×${a.qty}` : ""}`),
            `${counts.remaining} of ${counts.total} tiffins left`,
            counts.complimentary ? `incl. ${counts.complimentary} free` : null,
          ].filter(Boolean).map((x, i) => <span key={i} className={cn("inline-flex items-center gap-1.5", MUTED)}><span aria-hidden>·</span>{x}</span>)}
        </p>
        {renew != null && (
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
            <p className={cn("text-[13px]", MUTED)}>Renews in {renew} {renew === 1 ? "day" : "days"}</p>
            {renew <= RENEW_SOON_DAYS && <Link href="/me/renew" className={buttonClass({ variant: "primary", pill: true, className: "text-sm" })}>Renew plan</Link>}
          </div>
        )}
        {actions && <div className="mt-3 flex gap-2 border-t border-[var(--border)] pt-3 [&>*]:min-w-0 [&>*]:flex-1 lg:justify-end lg:[&>*]:flex-none" data-testid="plan-actions">{actions}</div>}
      </div>
    </header>
  );
}
