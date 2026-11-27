// Every project: clock-free start dates and the jsdom gaps UI tests need. No DB, no Redis.
import { vi } from "vitest";

// Start dates roll to the next day at the app cutoff hour. Suites book
// `nextWeekday(new Date())`, which that rule refuses between the cutoff and UTC
// midnight, so the wall clock is taken out of it here. app-today.test.ts and
// start-date-cutoff.test.ts unmock this to test the real rule.
vi.mock("@/lib/dates/start-date", async (importOriginal) => {
  const real = await importOriginal<typeof import("./lib/dates/start-date")>();
  return { ...real, appToday: (timezone?: string, _cutoffHour?: number, now?: number) => real.appToday(timezone, undefined, now) };
});

// input-otp (and other measure-on-mount UI) needs ResizeObserver, which jsdom
// lacks. Stub it globally; harmless in the node-env test files.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// input-otp also polls document.elementFromPoint (for focus/caret tracking),
// which jsdom lacks. Stub it to a no-op so typing into the hidden input works.
// Guarded: this file also runs in node-env test files, which have no `document`.
if (typeof document !== "undefined") {
  document.elementFromPoint ??= () => null;
  // ui-sdk popups (Dialog, Sheet, Select, Popover) wait on CSS animations and open the top layer.
  Element.prototype.getAnimations ??= () => [];
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  // jsdom has no CSS namespace, and ui-sdk's form code calls CSS.escape unguarded (forms/form.js), which threw an
  // unhandled ReferenceError after some tests finished (flaky CI on invites-list).
  globalThis.CSS ??= {
    escape: (value: string) => value.replace(/([^\w-])/g, "\\$1"),
    supports: () => false,
  } as unknown as typeof CSS;
  HTMLElement.prototype.showPopover ??= function () {};
  HTMLElement.prototype.hidePopover ??= function () {};
  // jsdom hides [popover] content it can't open; show only the open popup (ui-sdk sets data-open) so closed keepMounted content stays hidden.
  document.head.append(Object.assign(document.createElement("style"), { textContent: "[popover][data-open] { display: block !important }" }));
}

