import type { SVGProps } from "react";
import { ILLUSTRATION_COLORS as C } from "./tokens";

type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, "viewBox" | "width" | "height">;

// Every bowl-based icon shares this exact silhouette (rim curve, tapered body) so the set
// reads as one family — only the fill and what sits on top of the rim changes per category.
const BOWL_PATH = "M5 13 Q16 9 27 13 L25 22 Q16 27 7 22 Z";

function Bowl({ fill }: { fill: string }) {
  return (
    <>
      {/* A visible rim outline regardless of fill — without it, a cream-filled bowl (rice,
          raita) nearly disappears against DishImage's light card background. */}
      <path d={BOWL_PATH} fill={fill} stroke={C.neutral} strokeOpacity="0.3" strokeWidth="0.8" />
      <ellipse cx="16" cy="13" rx="10.6" ry="2" fill="white" fillOpacity="0.35" />
    </>
  );
}

function Base({ size = 22, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export function SabziIcon(props: IconProps) {
  return (
    <Base {...props}>
      <Bowl fill={C.orange} />
      <rect x="12" y="14" width="3" height="3" rx="0.8" fill={C.green} />
      <rect x="17" y="15.5" width="3" height="3" rx="0.8" fill={C.cream} />
      <rect x="14.5" y="18" width="3" height="3" rx="0.8" fill={C.green} />
    </Base>
  );
}

export function VegIcon(props: IconProps) {
  return (
    <Base {...props}>
      <Bowl fill={C.green} />
      <path
        d="M16 14 C12.5 14 10.5 16.5 11.5 20.5 C15 20.5 17.5 18.5 16 14 Z"
        fill={C.cream}
      />
      <path d="M11.7 20.2 L15.7 15.2" stroke={C.green} strokeWidth="0.8" strokeLinecap="round" />
    </Base>
  );
}

export function ProteinIcon(props: IconProps) {
  return (
    <Base {...props}>
      <ellipse cx="17" cy="16.5" rx="7.5" ry="6" fill={C.orange} transform="rotate(30 17 16.5)" />
      <rect x="8" y="20" width="3.4" height="8" rx="1.7" fill={C.cream} transform="rotate(30 9.7 24)" />
      <circle cx="7.6" cy="24.6" r="2.1" fill={C.cream} />
    </Base>
  );
}

export function CurryIcon(props: IconProps) {
  return (
    <Base {...props}>
      <Bowl fill={C.green} />
      <path d="M11 9 C10 7.5 11.5 6.5 11 5" stroke={C.orange} strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M16 8 C15 6.5 16.5 5.5 16 4" stroke={C.orange} strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M21 9 C20 7.5 21.5 6.5 21 5" stroke={C.orange} strokeWidth="1.1" strokeLinecap="round" fill="none" />
    </Base>
  );
}

export function DaalIcon(props: IconProps) {
  return (
    <Base {...props}>
      <Bowl fill={C.orange} />
      <circle cx="13" cy="17" r="1" fill={C.cream} />
      <circle cx="16.5" cy="18.5" r="1" fill={C.cream} />
      <circle cx="19.5" cy="16.5" r="1" fill={C.cream} />
      <path d="M24 12 L27.5 8.5" stroke={C.neutral} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="27.7" cy="8.3" r="1.4" fill={C.neutral} />
    </Base>
  );
}

export function RiceIcon(props: IconProps) {
  return (
    <Base {...props}>
      <Bowl fill={C.cream} />
      <path d="M5 13 Q16 9 27 13" stroke={C.green} strokeWidth="1.2" fill="none" />
      <path d="M13 16.5 L14.5 14.5 M16 17.5 L17.5 15.3 M19 16.8 L20.3 14.8" stroke={C.green} strokeWidth="1" strokeLinecap="round" />
    </Base>
  );
}

export function GrainIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M16 27 L16 8" stroke={C.green} strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="13" cy="11" rx="2.3" ry="1.4" fill={C.orange} transform="rotate(-30 13 11)" />
      <ellipse cx="19" cy="11" rx="2.3" ry="1.4" fill={C.orange} transform="rotate(30 19 11)" />
      <ellipse cx="12" cy="15.5" rx="2.3" ry="1.4" fill={C.orange} transform="rotate(-30 12 15.5)" />
      <ellipse cx="20" cy="15.5" rx="2.3" ry="1.4" fill={C.orange} transform="rotate(30 20 15.5)" />
      <ellipse cx="16" cy="8" rx="2" ry="1.3" fill={C.orange} />
    </Base>
  );
}

export function RotiIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="16" cy="17" r="10" fill={C.orange} />
      <path d="M8 15 Q16 19 24 15" stroke={C.neutral} strokeOpacity="0.35" strokeWidth="1.1" fill="none" />
      <circle cx="13" cy="14" r="0.7" fill={C.neutral} fillOpacity="0.4" />
      <circle cx="20" cy="20" r="0.7" fill={C.neutral} fillOpacity="0.4" />
      <circle cx="19" cy="12" r="0.7" fill={C.neutral} fillOpacity="0.4" />
    </Base>
  );
}

export function RaitaIcon(props: IconProps) {
  return (
    <Base {...props}>
      <Bowl fill={C.cream} />
      <path
        d="M9 16 Q12 14.5 15 16 T21 16 T27 15.5"
        stroke={C.green}
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M23 13 C21.5 13 21 14.5 22 15.5 C23.5 15.5 24 13.5 23 13 Z" fill={C.green} />
    </Base>
  );
}

export function SaladIcon(props: IconProps) {
  return (
    <Base {...props}>
      <Bowl fill={C.green} />
      <path d="M10 16 C9 15 10 13.5 11.5 14 C11.5 15.5 11 16.3 10 16 Z" fill={C.cream} />
      <path d="M22 15.5 C23.3 14.7 24.7 15.5 24 17 C22.6 17.3 21.7 16.5 22 15.5 Z" fill={C.cream} />
      <circle cx="16.5" cy="17.5" r="1.6" fill={C.orange} />
    </Base>
  );
}

export const DISH_CATEGORY_ILLUSTRATION: Record<string, (props: IconProps) => React.ReactElement> = {
  sabzi: SabziIcon,
  veg: VegIcon,
  protein: ProteinIcon,
  curry: CurryIcon,
  daal: DaalIcon,
  rice: RiceIcon,
  grain: GrainIcon,
  roti: RotiIcon,
  raita: RaitaIcon,
  salad: SaladIcon,
};
