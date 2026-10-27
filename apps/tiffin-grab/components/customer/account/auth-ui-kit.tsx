"use client";

import { isValidElement, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { AuthUi } from "@foundry/auth-ui";
import { Button, Field, Notice } from "@/components/customer/kit";
import { cn } from "@/components/customer/kit/cn";

type Reveal = { shown: boolean; onToggle: () => void };
/** The shared screens pass a "Show/Hide" RevealToggle as `trailing`; spot it by its props so it can be an eye. */
const revealOf = (t: ReactNode): Reveal | null =>
  isValidElement<Partial<Reveal>>(t) && typeof t.props.onToggle === "function" && typeof t.props.shown === "boolean" ? (t.props as Reveal) : null;

/** Customer-kit primitives for the shared @foundry/auth-ui security screens. */
export const kitAuthUi: AuthUi = {
  Button: ({ children, disabled, pending, pendingLabel: _pl, variant = "primary", className, ...rest }) => (
    // Capsules hug their label; the shared forms ask for w-full on phones.
    <Button variant={variant} pending={pending} disabled={disabled} className={cn("justify-self-start self-start", className?.replace(/\bw-full\b/, "w-fit"))} {...rest}>
      {children}
    </Button>
  ),
  Field: ({ trailing, error, label, ...input }) => {
    const reveal = revealOf(trailing);
    if (reveal) {
      // iOS-style: an eye inside the field, at the right of the input, in place of a "Show" word above it.
      return (
        <div className="relative">
          <Field label={label} error={error} className="pr-12" {...input} />
          <button
            type="button"
            onClick={reveal.onToggle}
            aria-label={reveal.shown ? "Hide password" : "Show password"}
            aria-pressed={reveal.shown}
            className="absolute top-8 right-1.5 grid size-10 place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            {reveal.shown ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          </button>
        </div>
      );
    }
    return (
      <div className="relative">
        <Field label={label} error={error} {...input} />
        {trailing ? <div className="absolute right-0 top-0 text-sm font-semibold [&>button]:static! [&>button]:translate-none!">{trailing}</div> : null}
      </div>
    );
  },
  Code: ({ label, length, masked, value, onChange, error }) => (
    <Field
      label={label}
      error={error}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
      type={masked ? "password" : "text"}
      inputMode="numeric"
      autoComplete={masked ? "off" : "one-time-code"}
      maxLength={length}
      placeholder={"•".repeat(length)}
    />
  ),
  Notice: ({ tone = "error", children }) => <Notice tone={tone === "error" ? "error" : "info"}>{children}</Notice>,
};
