"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

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
      pattern={REGEXP_ONLY_DIGITS}
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
