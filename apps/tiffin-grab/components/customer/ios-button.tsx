import type { ReactNode } from "react";

/** Highlight on touch-down. Instant, no overshoot — Apple default damping 1.0. */
export const IOS_PRESS =
  "transition-transform duration-100 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

/** iOS large control: 50pt tap, 14pt corner, 17pt semibold, size-specific tracking. */
export const IOS_BUTTON =
  "h-[50px] min-h-[50px] w-full !rounded-[14px] px-4 !text-[17px] font-semibold tracking-[-0.022em] justify-center shadow-none active:!translate-y-0 " +
  IOS_PRESS;

/**
 * Wrapper for a two-button ResponsiveDialog/Drawer footer (Cancel + primary
 * action): full-width IOS_BUTTON stack on mobile, evenly split side-by-side
 * on desktop.
 *
 * IOS_BUTTON is `w-full` by design — correct for the mobile stack — but two
 * `w-full` buttons dropped into the same `sm:flex-row` both claim 100% of the
 * row; flex-shrink can't compress either below its min-content width, so the
 * second button (normally Save/Confirm) gets squeezed almost entirely past
 * the right edge, clipped to a one-pixel sliver by ResponsiveDialog's
 * overflow-hidden. `sm:w-auto` is the same desktop override wizard.tsx
 * already uses on a bare IOS_BUTTON for exactly this reason — reused here via
 * a child selector so it applies to whatever's dropped in, rather than
 * relying on every future footer remembering to add it by hand (which is how
 * this bug landed in four separate dialogs in the first place).
 */
export function DialogFooterRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-col-reverse gap-2.5 sm:flex-row sm:[&>*]:min-w-0 sm:[&>*]:w-auto sm:[&>*]:flex-1">
      {children}
    </div>
  );
}
