/** Highlight on touch-down. Instant, no overshoot — Apple default damping 1.0. */
export const IOS_PRESS =
  "transition-transform duration-100 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

/** iOS large control: 50pt tap, capsule like every customer button (kit buttonClass), 17pt semibold. */
export const IOS_BUTTON =
  "h-[50px] min-h-[50px] w-full !rounded-full px-4 !text-body font-semibold tracking-[-0.022em] justify-center shadow-none active:!translate-y-0 " +
  IOS_PRESS;

