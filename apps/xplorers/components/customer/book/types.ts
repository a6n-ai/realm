import type { CodeError } from "@/lib/discounts/quote";
import type { Adjustment } from "@/db/schema/discounts";

export type ChildView = { publicId: string; name: string; dateOfBirth: string };

export type QuoteView = {
  endsAt: string;
  perChild: number;
  extensionPerChild: number;
  extraAdults: number;
  adultCharge: number;
  subtotal: number;
  adjustments: Adjustment[];
  taxTotal: number;
  /** What the booking charges; the only amount the review shows as payable. */
  total: number;
  codeError: CodeError | null;
  currency: string;
};

export type WizardSession = {
  occurrencePublicId: string;
  classPublicId: string;
  title: string;
  occursOn: string;
  startsAt: string;
  endsAt: string;
  dayLabel: string;
  remaining: number;
  ageMin: number | null;
  ageMax: number | null;
  ageWaiver: boolean;
};

export type WizardOptions = {
  mode: "length" | "options";
  /** Length mode: each offered length in minutes. */
  lengths: number[];
  /** Options mode: named bundles. */
  options: { key: string; label: string; lengthMinutes: number; adultsIncluded: number }[];
  extension: { stepMinutes: number } | null;
  /** Adults that come free; extraAdults = false means no more are allowed. */
  adultsFree: number;
  extraAdults: boolean;
  /** Smallest offered length: the last start time must leave room for it. */
  startTimes: string[];
};

export type WizardProps = {
  session: WizardSession;
  options: WizardOptions;
  initialChildren: ChildView[];
  timeZone: string;
  currency: string;
  rails: { id: string; label: string }[];
  coinsAvailable: boolean;
  backHref: string;
};
