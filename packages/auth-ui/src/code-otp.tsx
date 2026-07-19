"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@realm/ui/input-otp";

type CodeOtpProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  // Forwarded by FormControl's Slot (id / aria-describedby) so FormLabel/FormMessage stay wired.
  id?: string;
  "aria-describedby"?: string;
};

// 6-digit verification code entry, unmasked. Segmented input-otp component —
// plain controlled <Input> here misses real keystrokes' onChange in prod.
export function CodeOtp({ value, onChange, onComplete, autoFocus, disabled, ...rest }: CodeOtpProps) {
  return (
    <InputOTP
      maxLength={6}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      autoFocus={autoFocus}
      disabled={disabled}
      {...rest}
    >
      <InputOTPGroup>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <InputOTPSlot key={i} index={i} className="size-10 text-lg" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
