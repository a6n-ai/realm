import type { AuthButtonProps, AuthFieldProps, AuthUi } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useId } from "react";

const VARIANT = { primary: "default", outline: "outline", quiet: "ghost", danger: "destructive" } as const;

function KitButton({ variant = "primary", pending, pendingLabel, disabled, type = "button", className, onClick, children }: AuthButtonProps) {
  return (
    <Button type={type} variant={VARIANT[variant]} disabled={disabled || pending} onClick={onClick} className={`w-full gap-2 ${className ?? ""}`}>
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

function KitField({ label, error, trailing, id, ref, className, ...input }: AuthFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const control = (
    <Input
      id={fieldId}
      ref={ref}
      aria-invalid={!!error}
      aria-describedby={error ? `${fieldId}-error` : undefined}
      className={`${trailing ? "pr-12" : ""} ${className ?? ""}`}
      {...input}
    />
  );
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{label}</Label>
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

export function AuthLogo() {
  return (
    <Link to="/" aria-label="a6n CRM home" className="flex items-center gap-2 font-semibold text-(--strong)">
      <img src="/icon.svg" alt="" className="size-8" />
      a6n CRM
    </Link>
  );
}

export function AuthPage({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col justify-center px-4 py-8">{children}</main>;
}
