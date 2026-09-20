"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn, FONT, FOCUS } from "./cn";

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  label: string;
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  idPrefix?: string;
  variant?: "tabs" | "segmented";
  className?: string;
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

export function Tabs({ label, items, value, onChange, idPrefix = "kit", variant = "tabs", className }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent, i: number) => {
    const last = items.length - 1;
    const to = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const id = items[to].id;
    onChange(id);
    refs.current[id]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn(FONT, "flex gap-1.5 overflow-x-auto overscroll-x-contain", variant === "segmented" && "rounded-full bg-[var(--muted)] p-1", className)}>
      {items.map((it, i) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            ref={(el) => {
              refs.current[it.id] = el;
            }}
            id={tabId(idPrefix, it.id)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId(idPrefix, it.id)}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(it.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              FOCUS,
              "min-h-11 flex-none rounded-full px-4 text-sm font-semibold [touch-action:manipulation] transition-colors duration-150 motion-reduce:transition-none",
              on
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : variant === "tabs"
                  ? "border-[1.5px] border-[var(--border)] bg-[var(--card)]"
                  : "text-[var(--muted-foreground,#6E6558)]",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented(props: Omit<TabsProps, "variant">) {
  return <Tabs {...props} variant="segmented" />;
}
