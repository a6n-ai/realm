"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { Star, X } from "lucide-react";
import { buttonClass } from "@/components/customer/kit/button-class";
import { cn, FOCUS, FONT } from "@/components/customer/kit/cn";

// Apple's defaults: critically damped to arrive, a touch of bounce only when a flick throws it.
const ARRIVE = { type: "spring", bounce: 0, duration: 0.45 } as const;
const THROW = { type: "spring", bounce: 0.15, duration: 0.35 } as const;
const SHOW_AFTER_MS = 1200;

// Scroll-style momentum projection (Designing Fluid Interfaces): where a flick would come to rest.
const project = (v: number, d = 0.998) => ((v / 1000) * d) / (1 - d);
// Progressive resistance past the resting point, so pulling down feels soft, not stuck.
const rubberband = (over: number, dim: number, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

/**
 * Liquid-glass notification that drops in from the top of the customer app. Swipe it up or tap X to
 * dismiss; `actions` gets the same `close` so an answer leaves the same way. `onDone` runs once on any close.
 */
export function SwipeBanner({
  label, icon, title, body, actions, onDone, showAfterMs = SHOW_AFTER_MS,
}: {
  label: string;
  icon: ReactNode;
  title: string;
  body: ReactNode;
  actions: (close: () => void) => ReactNode;
  onDone: () => void | Promise<void>;
  showAfterMs?: number;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const y = useMotionValue(-140);
  const opacity = useTransform(y, [-120, 0], [0, 1]);
  const drag = useRef<{ id: number; startY: number; originY: number; samples: { y: number; t: number }[] } | null>(null);
  const closing = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setOpen(true);
      if (reduce) y.set(0);
      else animate(y, 0, ARRIVE);
    }, showAfterMs);
    return () => clearTimeout(t);
  }, [reduce, y, showAfterMs]);

  const close = (velocity = 0) => {
    if (closing.current) return;
    closing.current = true;
    void onDone();
    const off = -((ref.current?.offsetHeight ?? 120) + 40);
    if (reduce) {
      y.set(off);
      setOpen(false);
      return;
    }
    // Leaves the way it came: back up through the top edge, carrying the finger's speed.
    animate(y, off, { ...THROW, velocity }).then(() => setOpen(false));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    y.stop();
    drag.current = { id: e.pointerId, startY: e.clientY, originY: y.get(), samples: [{ y: e.clientY, t: e.timeStamp }] };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const raw = d.originY + (e.clientY - d.startY);
    y.set(raw > 0 ? rubberband(raw, 120) : raw);
    d.samples = [...d.samples.slice(-4), { y: e.clientY, t: e.timeStamp }];
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const dt = last.t - first.t;
    const velocity = dt > 0 ? ((last.y - first.y) / dt) * 1000 : 0;
    if (y.get() + project(velocity) < -48) close(velocity);
    else animate(y, 0, { ...(velocity > 0 ? THROW : ARRIVE), velocity });
  };

  if (!open) return null;

  return (
    <m.div
      ref={ref}
      role="region"
      aria-label={label}
      style={{ y, opacity, top: "max(0.75rem, env(safe-area-inset-top))" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        FONT,
        "c-liquid fixed inset-x-3 z-[60] mx-auto flex max-w-md touch-none select-none items-center gap-3 rounded-[28px] p-3 pr-2 will-change-transform",
      )}
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-[var(--primary-foreground,#fff)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-subhead font-semibold leading-tight tracking-[-0.01em] text-foreground">{title}</p>
        <p className="m-0 mt-0.5 text-footnote leading-snug text-muted-foreground">{body}</p>
      </div>
      {actions(() => close())}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => close()}
        className={cn(FOCUS, "grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground")}
      >
        <X className="size-4" />
      </button>
      {/* Grabber: the affordance that says this sheet moves. */}
      <span aria-hidden className="absolute bottom-1 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-foreground/18" />
    </m.div>
  );
}

/** Asks a customer who has eaten with us for a Google review. Any close ends it for good. */
export function ReviewBanner({ reviewUrl, onDone }: { reviewUrl: string; onDone: () => Promise<void> }) {
  return (
    <SwipeBanner
      label="Review request"
      icon={<Star className="size-5 fill-current" strokeWidth={1.75} />}
      title="Enjoying your tiffins?"
      body="A quick Google review helps other families find us."
      onDone={onDone}
      actions={(close) => (
        <a href={reviewUrl} target="_blank" rel="noreferrer" onClick={close} className={buttonClass({ variant: "primary", className: "shrink-0" })}>
          Review
        </a>
      )}
    />
  );
}
