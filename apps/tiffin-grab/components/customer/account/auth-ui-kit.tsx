"use client";

import type { AuthUi } from "@foundry/auth-ui";
import { Button, Field, Notice } from "@/components/customer/kit";

/** Customer-kit primitives for the shared @foundry/auth-ui security screens. */
export const kitAuthUi: AuthUi = {
  Button: ({ children, disabled, pending, pendingLabel: _pl, variant = "primary", ...rest }) => (
    <Button variant={variant} size="lg" pending={pending} disabled={disabled} {...rest}>
      {children}
    </Button>
  ),
  Field: ({ trailing, error, label, ...input }) => (
    <div className="relative">
      <Field label={label} error={error} {...input} />
      {trailing ? <div className="absolute right-0 top-0 text-sm font-semibold [&>button]:static! [&>button]:translate-none!">{trailing}</div> : null}
    </div>
  ),
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
