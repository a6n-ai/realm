"use client";

import Link from "next/link";
import type { AuthButtonProps, AuthFieldProps, AuthUi } from "@foundry/auth-ui";
import { Button as KitBtn, Field } from "@/components/customer/kit";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";

// TiffinGrab's skin for the shared @foundry/auth-ui screens: the same iOS-sized
// controls (50px targets, 14px corners, 17px type) the customer app uses.
// The kit Field's filled look (no outline until invalid), for the auth forms' own react-hook-form inputs.
export const IOS_INPUT = "!h-[52px] !rounded-2xl !border-transparent !bg-foreground/7 !px-4 !text-body !shadow-none tracking-[-0.011em] aria-[invalid=true]:!border-[#be123c]";
// @foundry/ui PhoneInput is a country button + input at h-8; same lift as IOS_INPUT, on a wrapper.
export const IOS_PHONE = "[&_input]:!h-[52px] [&_input]:!text-body [&_input]:!rounded-e-2xl [&_button]:!h-[52px] [&_button]:!rounded-s-2xl";

// The auth screens (login, set password, verify) wear the customer kit itself: the same capsule buttons and filled
// fields as the order flow, so signing in looks like the rest of the app instead of a separate shadcn skin.
function KitButton({ variant = "primary", pending, pendingLabel, disabled, type = "button", className, onClick, children }: AuthButtonProps) {
  return (
    <KitBtn type={type} variant={variant} size="lg" pending={pending} disabled={disabled} onClick={onClick} className={`w-full ${className ?? ""}`}>
      {pending && pendingLabel ? pendingLabel : children}
    </KitBtn>
  );
}

function KitField({ label, error, trailing, id, ref, className, ...input }: AuthFieldProps) {
  if (!trailing) return <Field id={id} ref={ref} label={label} error={error} className={className} {...input} />;
  // A trailing control (show password) sits inside the field, over its right edge.
  return (
    <div className="relative">
      <Field id={id} ref={ref} label={label} error={error} className={`pr-12 ${className ?? ""}`} {...input} />
      <div className="absolute right-0 top-[calc(theme(spacing.6)+2px)]">{trailing}</div>
    </div>
  );
}

export const tiffinAuthUi: Partial<AuthUi> = { Button: KitButton, Field: KitField };

/** The live logo, shown once per auth screen at the top of its AuthPanel. */
export function AuthLogo() {
  return (
    <Link href="/" aria-label="TiffinGrab home" style={{ ["--brand" as string]: "#C2580B" }} className="group flex items-center gap-2.5 rounded-xl transition-transform duration-300 ease-soft active:scale-[0.98] hover:-translate-y-0.5">
      <BrandMark className="size-12 transition-transform duration-500 ease-spring group-hover:-rotate-8" />
      <BrandWordmark className="text-[26px]" />
    </Link>
  );
}

export function AuthLegal() {
  return (
    <>
      By continuing, you agree to our <Link href="/terms" className="inline-flex min-h-6 items-center underline underline-offset-4 decoration-current/40 transition-[text-decoration-color,color] duration-200 hover:decoration-current hover:text-foreground">Terms of Service</Link> and <Link href="/privacy" className="inline-flex min-h-6 items-center underline underline-offset-4 decoration-current/40 transition-[text-decoration-color,color] duration-200 hover:decoration-current hover:text-foreground">Privacy Policy</Link>.
    </>
  );
}
