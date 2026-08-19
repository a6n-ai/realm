/** Highlight on touch-down. Instant, no overshoot — Apple default damping 1.0. */
export const IOS_PRESS =
  "transition-transform duration-100 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

/** iOS large control: 50pt tap, 14pt corner, 17pt semibold, size-specific tracking. */
export const IOS_BUTTON =
  "h-[50px] min-h-[50px] w-full !rounded-[14px] px-4 !text-[17px] font-semibold tracking-[-0.022em] justify-center shadow-none active:!translate-y-0 " +
  IOS_PRESS;
