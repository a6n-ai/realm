"use client";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@foundry/ui/input-otp";

// Same as input-otp's REGEXP_ONLY_DIGITS — keep the constant here so the app
// does not need a direct dependency on the package Foundry already wraps.
const DIGITS_ONLY = "^\\d+$";

type PinOtpProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
};

// 4-digit PIN entry, masked like a phone unlock screen. Single home for PIN
// input so /lock and the account Security tab stay identical.
export function PinOtp({ value, onChange, onComplete, autoFocus, disabled, ...aria }: PinOtpProps) {
  return (
    <InputOTP
      maxLength={4}
      pattern={DIGITS_ONLY}
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      autoFocus={autoFocus}
      disabled={disabled}
      {...aria}
    >
      <InputOTPGroup>
        {[0, 1, 2, 3].map((i) => (
          <InputOTPSlot key={i} index={i} masked className="size-12 text-xl" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
