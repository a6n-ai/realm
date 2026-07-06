import {
  ArrowRightIcon,
  BanknoteIcon,
  CheckCircleIcon,
  LinkIcon,
  MailIcon,
  MapPinIcon,
  MessageCircleIcon,
  PackageIcon,
  PhoneForwardedIcon,
  PhoneIcon,
  SparklesIcon,
  StickyNoteIcon,
} from "lucide-react";
import { Badge } from "@realm/ui/badge";
import { cn } from "@realm/ui/cn";
import { formatEpoch } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";

export type TimelineActivity = {
  publicId: string;
  type: string;
  note: string | null;
  outcome: string | null;
  amount: number | null;
  nextFollowUpAt: number | null;
  fromStage: string | null;
  toStage: string | null;
  createdAt: number;
};

// Per-type node: lucide icon + a tinted circle. Currency is configurable, so
// money activities use a neutral BanknoteIcon rather than a ₹-specific glyph.
const NODE: Record<string, { icon: typeof PhoneIcon; className: string }> = {
  created: { icon: SparklesIcon, className: "bg-muted text-muted-foreground" },
  note: { icon: StickyNoteIcon, className: "bg-muted text-muted-foreground" },
  stage_change: { icon: ArrowRightIcon, className: "bg-primary/12 text-primary" },
  converted: { icon: CheckCircleIcon, className: "bg-ok/15 text-ok" },
  call: { icon: PhoneIcon, className: "bg-primary/12 text-primary" },
  whatsapp: { icon: MessageCircleIcon, className: "bg-ok/15 text-ok" },
  email: { icon: MailIcon, className: "bg-primary/12 text-primary" },
  quote_sent: { icon: BanknoteIcon, className: "bg-warn/15 text-warn" },
  sample_sent: { icon: PackageIcon, className: "bg-primary/12 text-primary" },
  payment_link_sent: { icon: LinkIcon, className: "bg-warn/15 text-warn" },
  visit: { icon: MapPinIcon, className: "bg-primary/12 text-primary" },
  callback: { icon: PhoneForwardedIcon, className: "bg-primary/12 text-primary" },
};

// Title line for an activity. `outcome` is rendered as its own chip below, so
// the call/whatsapp/email titles no longer inline it (avoids duplication).
export function describe(a: TimelineActivity, currency: string): string {
  switch (a.type) {
    case "created":
      return "Inquiry created";
    case "converted":
      return "Converted to an order";
    case "stage_change":
      return `Stage: ${a.fromStage} → ${a.toStage}`;
    case "call":
      return "Call";
    case "whatsapp":
      return "WhatsApp";
    case "email":
      return "Email";
    case "quote_sent":
      return `Quote sent${a.amount != null ? ` — ${formatMoney(a.amount, currency)}` : ""}`;
    case "payment_link_sent":
      return `Payment link sent${a.amount != null ? ` — ${formatMoney(a.amount, currency)}` : ""}`;
    case "sample_sent":
      return "Sample sent";
    case "visit":
      return `Site visit${a.note ? ` — ${a.note}` : ""}`;
    case "callback":
      return "Callback scheduled";
    default:
      return a.note ?? "";
  }
}

function MetaChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function InquiryTimeline({
  activities,
  currency,
  terminal,
}: {
  activities: TimelineActivity[];
  currency: string;
  terminal: boolean;
}) {
  if (activities.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">No activity yet.</p>;
  }
  const now = Date.now();

  return (
    <ol className="relative">
      {activities.map((a, i) => {
        const node = NODE[a.type] ?? NODE.note;
        const Icon = node.icon;
        const isLast = i === activities.length - 1;
        // Only the newest row surfaces an overdue follow-up, and never on a
        // converted/lost inquiry (terminal).
        const overdue =
          a.nextFollowUpAt != null && a.nextFollowUpAt < now && i === 0 && !terminal;

        return (
          <li
            key={a.publicId}
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 relative flex gap-3 pb-6 last:pb-0"
            style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
          >
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "ring-background z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4",
                  node.className,
                )}
              >
                <Icon className="size-4" />
              </span>
              {!isLast ? <span aria-hidden className="w-px flex-1 bg-border" /> : null}
            </div>

            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{describe(a, currency)}</p>
                {overdue ? (
                  <Badge variant="destructive" className="shrink-0">
                    Overdue
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {formatEpoch(a.createdAt, { mode: "datetime" })}
              </p>

              {a.outcome || a.amount != null || a.nextFollowUpAt != null ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {a.outcome ? <MetaChip>{a.outcome}</MetaChip> : null}
                  {a.amount != null ? (
                    <MetaChip className="tabular-nums">{formatMoney(a.amount, currency)}</MetaChip>
                  ) : null}
                  {a.nextFollowUpAt != null ? (
                    <MetaChip
                      className={cn(overdue && "border-bad/30 bg-bad/10 text-bad")}
                    >
                      ↳ Next: {formatEpoch(a.nextFollowUpAt, { mode: "date" })}
                    </MetaChip>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
