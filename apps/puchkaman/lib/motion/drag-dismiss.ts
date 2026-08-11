/**
 * Drag-to-dismiss maths for the cart drawer and the modifier sheet.
 *
 * Pure on purpose: the hook that owns pointer capture and DOM writes lives in
 * `use-drag-dismiss.ts`, so every decision a gesture makes ("is this a
 * dismiss?", "how far does a flick throw it?") stays testable under the node
 * test environment without a DOM.
 *
 * All distances are px and all velocities px/ms, signed so that POSITIVE is the
 * dismiss direction. The caller normalises the axis before it gets here.
 */

/** A flick this fast dismisses regardless of how far it travelled. */
export const DISMISS_VELOCITY = 0.11;

/** Movement before a drag is claimed — below this it is still a tap. */
export const DRAG_THRESHOLD = 10;

/** Fraction of the surface a projected landing must pass to dismiss. */
const DISMISS_FRACTION = 0.5;

/**
 * Resistance past a boundary. The further out, the less the surface follows —
 * real things slow before they stop, and a hard stop reads as "frozen" rather
 * than "there is nothing more this way".
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot <= 0 || dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * overshoot);
}

/**
 * Where a flick would come to rest, by the same exponential decay a native
 * scroller uses. This is what makes a short fast flick throw the sheet: the
 * decision is made against where the gesture was GOING, not where the finger
 * happened to lift.
 */
export function projectEndpoint(current: number, velocity: number, decelerationRate = 0.998): number {
  return current + (velocity * decelerationRate) / (1 - decelerationRate);
}

/** Drag offset to render: 1:1 in the dismiss direction, damped against it. */
export function dragOffset(raw: number, size: number): number {
  return raw >= 0 ? raw : -rubberband(-raw, size);
}

/**
 * Dismiss when the projected landing clears half the surface, or when the
 * release was a fast flick in the dismiss direction. Distance alone would force
 * users to haul the sheet most of the way down; velocity alone would ignore a
 * slow, deliberate full-length drag.
 */
export function shouldDismiss(distance: number, velocity: number, size: number): boolean {
  if (distance <= 0) return false;
  if (velocity >= DISMISS_VELOCITY) return true;
  return projectEndpoint(distance, velocity) >= size * DISMISS_FRACTION;
}
