"use client";

/**
 * Country dial code + national number. The pair is joined into an E.164-ish
 * string ("+1 4165550100") and the server re-parses it with libphonenumber
 * before it ever reaches the database, so this list only has to cover the
 * codes our customers actually dial.
 *
 * ponytail: hand-picked list rather than full ISO metadata — swap in
 * libphonenumber's getCountries() if we ever ship outside the GTA.
 */
const DIAL_CODES: { code: string; label: string }[] = [
  { code: "+1", label: "Canada / United States" },
  { code: "+91", label: "India" },
  { code: "+880", label: "Bangladesh" },
  { code: "+92", label: "Pakistan" },
  { code: "+94", label: "Sri Lanka" },
  { code: "+977", label: "Nepal" },
  { code: "+44", label: "United Kingdom" },
  { code: "+61", label: "Australia" },
  { code: "+63", label: "Philippines" },
  { code: "+86", label: "China" },
  { code: "+234", label: "Nigeria" },
  { code: "+27", label: "South Africa" },
  { code: "+52", label: "Mexico" },
  { code: "+55", label: "Brazil" },
  { code: "+971", label: "United Arab Emirates" },
];

export const DEFAULT_DIAL_CODE = "+1";

/** What gets sent to /api/checkout. Empty national number stays empty so the
 *  "required" error reads as missing rather than malformed. */
export function joinPhone(dial: string, national: string): string {
  const digits = national.replace(/[^\d]/g, "");
  return digits ? `${dial}${digits}` : "";
}

export function PhoneField({
  dial,
  national,
  onDialChange,
  onNationalChange,
  error,
  id,
}: {
  dial: string;
  national: string;
  onDialChange: (v: string) => void;
  onNationalChange: (v: string) => void;
  error?: string;
  id: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={`field checkout-field ${error ? "field--err" : ""}`}>
      <label htmlFor={id}>Phone *</label>
      <div className="phone-field">
        <select
          className="select phone-field__code"
          value={dial}
          onChange={(e) => onDialChange(e.target.value)}
          aria-label="Country calling code"
        >
          {DIAL_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.label}
            </option>
          ))}
        </select>
        <input
          id={id}
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="416 000 0000"
          value={national}
          onChange={(e) => onNationalChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          required
        />
      </div>
      {error ? (
        <span id={errorId} className="err-msg" role="alert">
          {error}
        </span>
      ) : (
        <span className="checkout-hint">We only call about this order.</span>
      )}
    </div>
  );
}
