"use client";

/**
 * Move focus to the first field a failed submit rejected.
 *
 * The public forms mark bad fields with `.field--err` and wire up
 * `aria-describedby`, but on submit they left focus on the button — so a
 * keyboard or screen-reader user got a form that silently refused, with the
 * reason sitting somewhere above them. Focusing the field announces its label
 * and its error together, and scrolls it into view for everyone else.
 *
 * Deferred a frame because the error class is applied by the render that this
 * call's `setErrors` triggers; querying now would search the pre-error DOM.
 */
export function focusFirstError(form: HTMLFormElement | null): void {
  if (!form) return;
  requestAnimationFrame(() => {
    form
      .querySelector<HTMLElement>(".field--err input, .field--err select, .field--err textarea")
      ?.focus();
  });
}
