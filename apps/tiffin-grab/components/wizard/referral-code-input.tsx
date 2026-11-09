"use client";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@foundry/ui/input-otp";
import { normalizeReferralCode } from "@/lib/referrals/cookie";

// Same alphabet isReferralCodeShape accepts (no 0/O, 1/I/L look-alikes), either case while typing.
const REFERRAL_CHARS = "^[A-HJ-NP-Za-hj-np-z2-9]*$";

/** Referral code in boxes like the email code. Codes are 6 characters; ones made before 2026-10-22 are 8,
 * so the row grows to 8 boxes once a 7th character is typed. */
export function ReferralCodeInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const slots = value.length > 6 ? 8 : 6;
  return (
    <InputOTP
      id={id}
      maxLength={8}
      pattern={REFERRAL_CHARS}
      inputMode="text"
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      value={value}
      onChange={(v) => onChange(normalizeReferralCode(v))}
      // A pasted "abc-234" or "ABC 234" would fail the pattern whole; keep only code characters.
      pasteTransformer={(text) => normalizeReferralCode(text).replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 8)}
      aria-invalid={invalid}
      containerClassName="w-full max-w-sm"
    >
      <InputOTPGroup className="w-full gap-2">
        {Array.from({ length: slots }, (_, i) => (
          <InputOTPSlot
            key={i}
            index={i}
            className="aspect-square h-auto min-w-0 flex-1 rounded-xl border text-xl font-medium uppercase first:rounded-xl last:rounded-xl"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
