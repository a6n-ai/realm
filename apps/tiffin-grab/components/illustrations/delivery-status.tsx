import type { SVGProps } from "react";
import { ILLUSTRATION_COLORS as C } from "./tokens";

type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, "viewBox" | "width" | "height">;

function Base({ size = 22, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

/** Cutoff passed / delivered — a closed tiffin carrier with a confirming checkmark badge. */
export function DeliveredStatusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="9" y="17" width="14" height="7" rx="1.4" fill={C.green} />
      <rect x="9.8" y="12" width="12.4" height="5.5" rx="1.2" fill={C.green} fillOpacity="0.8" />
      <rect x="12.5" y="9" width="7" height="3.5" rx="1" fill={C.green} fillOpacity="0.6" />
      <path d="M13 8.5 Q16 6 19 8.5" stroke={C.neutral} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <circle cx="24" cy="23" r="5.4" fill={C.cream} stroke={C.green} strokeWidth="1.4" />
      <path d="M21.7 23 L23.3 24.6 L26.4 21.4" stroke={C.green} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

/** Scheduled / still to come — a scooter in motion, carrying the delivery box. */
export function UpcomingStatusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10.5" cy="24" r="3" fill="none" stroke={C.neutral} strokeWidth="1.6" />
      <circle cx="23" cy="24" r="3" fill="none" stroke={C.neutral} strokeWidth="1.6" />
      <path
        d="M10.5 24 L14 24 L16.5 17.5 L19.5 17.5 M19.5 17.5 L19.5 21 L23 24 M19.5 17.5 L22 15"
        stroke={C.neutral}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="21.5" y="9.5" width="6" height="6" rx="1.2" fill={C.orange} transform="rotate(-12 24.5 12.5)" />
    </Base>
  );
}

/** Paused for a stretch of days — a palm-and-sun scene reading plainly as "away." */
export function VacationStatusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="22" cy="10" r="3.4" fill={C.orange} />
      <path d="M6 25 Q16 20 26 25" stroke={C.orange} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path
        d="M11 25 C11 19 8 17.5 6 16.5 C8 15.7 12 15.8 13.5 19.5 C15 15.8 19 15.7 21 16.5 C19 17.5 16 19 16 25"
        stroke={C.green}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Base>
  );
}

/** Skipped / missed cutoff — a plain pause glyph. Uses the app's functional red (--bad),
 * exempt from the green/orange-only rule the same way error states are elsewhere in the
 * app: this is a genuine "something needs attention" signal, not decoration. */
export function OnHoldStatusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="16" cy="16" r="11" fill="none" stroke="#DC2626" strokeOpacity="0.25" strokeWidth="2" />
      <rect x="12.5" y="11" width="2.6" height="10" rx="1.2" fill="#DC2626" />
      <rect x="17" y="11" width="2.6" height="10" rx="1.2" fill="#DC2626" />
    </Base>
  );
}

export const DELIVERY_STATUS_ILLUSTRATION = {
  delivered: DeliveredStatusIcon,
  upcoming: UpcomingStatusIcon,
  vacation: VacationStatusIcon,
  onHold: OnHoldStatusIcon,
} as const;
