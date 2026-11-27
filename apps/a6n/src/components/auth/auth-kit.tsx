import type { AuthButtonProps, AuthFieldProps, AuthUi } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Link } from "@tanstack/react-router";
import { EyeIcon, EyeOffIcon, Loader2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

const VARIANT = { primary: "default", outline: "outline", quiet: "ghost", danger: "destructive" } as const;

// Vercel auth controls: one height for inputs and buttons, labels read by screen readers only.
const CONTROL = "h-11 w-full text-base";

function KitButton({ variant = "primary", pending, pendingLabel, disabled, type = "button", className, onClick, children }: AuthButtonProps) {
  return (
    <Button type={type} size="lg" variant={VARIANT[variant]} disabled={disabled || pending} onClick={onClick} className={`${CONTROL} gap-2 ${className ?? ""}`}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

// Vercel's password reveal: an eye icon button inside the field. Replaces @foundry/auth-ui's text "Show"/"Hide" toggle.
function RevealButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const Icon = shown ? EyeOffIcon : EyeIcon;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}

function KitField({ label, error, trailing: _authUiToggle, id, ref, className, placeholder, ...input }: AuthFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const [shown, setShown] = useState(false);
  // auth-ui flips type itself only through its own toggle, which we drop; a field that starts as a password keeps ours.
  const isPassword = input.type === "password" || (_authUiToggle != null && input.type === "text");
  const trailing = isPassword ? <RevealButton shown={shown} onToggle={() => setShown((s) => !s)} /> : null;
  if (isPassword) input = { ...input, type: shown ? "text" : "password" };
  const control = (
    <Input
      id={fieldId}
      ref={ref}
      aria-invalid={!!error}
      aria-describedby={error ? `${fieldId}-error` : undefined}
      placeholder={placeholder ?? (typeof label === "string" ? label : undefined)}
      className={`${CONTROL} px-3 ${trailing ? "pr-12" : ""} ${className ?? ""}`}
      {...input}
    />
  );
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId} className="sr-only">
        {label}
      </Label>
      {trailing ? (
        <div className="relative">
          {control}
          {trailing}
        </div>
      ) : (
        control
      )}
      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const appAuthUi: Partial<AuthUi> = { Button: KitButton, Field: KitField };

// The a6n mark in theme colours: black on light, white on dark (Vercel-style monochrome).
export function AppMark({ className = "size-7" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-md bg-(--brand) font-bold text-(--brand-foreground) text-[0.8em] leading-none ${className}`}
    >
      a6
    </span>
  );
}

export function AuthLogo() {
  return (
    <Link to="/" aria-label="a6n home" className="flex items-center gap-2 font-semibold text-(--strong)">
      <AppMark />
      a6n
    </Link>
  );
}

export const AUTH_QUIET_LINK = "text-center text-sm text-muted-foreground transition-colors hover:text-foreground";

// Vercel-style auth page: hairline header, one centred 360px column, no card.
export function AuthCard({ title, text, footer, children }: { title: ReactNode; text?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-8">
          <AuthLogo />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
        <div className="flex w-full max-w-[360px] flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-balance text-center text-title-1 font-semibold tracking-tight">{title}</h1>
            {text ? <p className="text-pretty text-center text-base text-muted-foreground">{text}</p> : null}
          </div>
          {children}
        </div>
        {footer ? <p className="text-center text-sm text-muted-foreground">{footer}</p> : null}
      </main>
    </div>
  );
}
