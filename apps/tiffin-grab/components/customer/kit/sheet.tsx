"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn, FONT, FOCUS } from "./cn";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
const EASE = "cubic-bezier(.22,1,.36,1)";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Sticky bottom area (the one primary CTA). */
  footer?: ReactNode;
}

export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const [present, setPresent] = useState(open);
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const restore = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);

  useEffect(() => {
    if (open) setPresent(true);
  }, [open]);

  const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const side = () => typeof matchMedia === "function" && matchMedia("(min-width: 768px)").matches;
  const off = () => (side() ? "translateX(100%)" : "translateY(100%)");

  useEffect(() => {
    if (!present) return;
    const el = panel.current;
    if (!open) {
      document.body.style.overflow = "";
      const done = () => {
        setPresent(false);
        restore.current?.focus();
      };
      if (!el?.animate || reduced()) return done();
      scrim.current?.animate({ opacity: [1, 0] }, { duration: 250, fill: "forwards" });
      el.animate({ transform: [getComputedStyle(el).transform || "none", off()] }, { duration: 400, easing: EASE, fill: "forwards" }).onfinish = done;
      return;
    }
    restore.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    el?.focus();
    if (el?.animate && !reduced()) {
      el.animate({ transform: [off(), "none"] }, { duration: 400, easing: EASE });
      scrim.current?.animate({ opacity: [0, 1] }, { duration: 250, easing: EASE });
    }
    return () => {
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, present]);

  if (!present || typeof document === "undefined") return null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") return onClose();
    if (e.key !== "Tab") return;
    const items = [...panel.current!.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return e.preventDefault();
    const [first, last] = [items[0], items[items.length - 1]];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === panel.current)) (e.preventDefault(), last.focus());
    else if (!e.shiftKey && at === last) (e.preventDefault(), first.focus());
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (side()) return;
    drag.current = { y: e.clientY, t: e.timeStamp, dy: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !panel.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    panel.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    const el = panel.current;
    if (!d || !el) return;
    const v = d.dy / Math.max(1, e.timeStamp - d.t);
    if (v > 0.5 || d.dy > el.offsetHeight * 0.4) {
      el.style.transform = "";
      onClose();
    } else {
      el.style.transition = `transform 300ms cubic-bezier(.34,1.56,.64,1)`;
      el.style.transform = "";
      setTimeout(() => (el.style.transition = ""), 300);
    }
  };

  return createPortal(
    <div className={cn(FONT, "fixed inset-0 z-50")} onKeyDown={onKeyDown}>
      <div ref={scrim} data-testid="sheet-scrim" onClick={onClose} className="absolute inset-0 bg-[rgba(20,16,12,.45)]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "absolute flex flex-col bg-[var(--card)] text-[var(--foreground)] shadow-[0_-8px_40px_rgba(0,0,0,.18)] outline-none overscroll-contain",
          "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[var(--c-radius-sheet,28px)]",
          "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[440px] md:rounded-l-[28px] md:rounded-tr-none",
        )}
      >
        <div
          className="flex touch-none justify-center pb-1 pt-2.5 md:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-[var(--border)]" />
        </div>
        <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-2 md:pt-5">
          <h2 id={titleId} className="text-[22px] font-bold tracking-[-0.02em]">
            {title}
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className={cn(FOCUS, "grid size-11 place-items-center rounded-full bg-[var(--muted)]")}>
            <X aria-hidden className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2">{children}</div>
        {footer && (
          <footer className="border-t border-[var(--border)] bg-[var(--card)] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">{footer}</footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
