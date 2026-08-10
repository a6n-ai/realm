import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decideTrackingAccess,
  MAX_PIN_ATTEMPTS,
  PIN_ATTEMPT_WINDOW_MS,
  type TrackingSubject,
} from "./access";

const GUEST: TrackingSubject = { phone: "+14165551234", ownerUserId: null };
const OWNED: TrackingSubject = { phone: "+14165551234", ownerUserId: "usr_1" };

// The attempt counter is per-process and deliberately not resettable, so every
// test works on its own order id rather than trying to clear shared state.
let seq = 0;
const nextId = () => `ord_test${(seq += 1)}`;

beforeEach(() => {
  vi.useFakeTimers();
});

describe("decideTrackingAccess", () => {
  it("lets the logged-in owner in with no pin", () => {
    expect(
      decideTrackingAccess({ orderId: nextId(), subject: OWNED, viewerUserId: "usr_1" }),
    ).toBe("granted");
  });

  it("does not treat another logged-in user as the owner", () => {
    expect(
      decideTrackingAccess({ orderId: nextId(), subject: OWNED, viewerUserId: "usr_2" }),
    ).toBe("pin_required");
  });

  it("does not hand a guest order to whoever happens to be logged in", () => {
    expect(
      decideTrackingAccess({ orderId: nextId(), subject: GUEST, viewerUserId: "usr_1" }),
    ).toBe("pin_required");
  });

  it("asks for a pin without charging an attempt", () => {
    const orderId = nextId();
    for (let i = 0; i < MAX_PIN_ATTEMPTS * 3; i++) {
      expect(decideTrackingAccess({ orderId, subject: GUEST })).toBe("pin_required");
    }
    // Still has its full budget afterwards.
    expect(decideTrackingAccess({ orderId, subject: GUEST, pin: "1234" })).toBe("granted");
  });

  it("grants on the correct pin, however it was typed", () => {
    expect(decideTrackingAccess({ orderId: nextId(), subject: GUEST, pin: "1234" })).toBe(
      "granted",
    );
    expect(decideTrackingAccess({ orderId: nextId(), subject: GUEST, pin: "12 34" })).toBe(
      "granted",
    );
  });

  it("rejects a wrong pin", () => {
    expect(decideTrackingAccess({ orderId: nextId(), subject: GUEST, pin: "0000" })).toBe(
      "wrong_pin",
    );
  });

  it("locks out after the allowed number of submissions", () => {
    const orderId = nextId();
    const attempt = (pin: string) => decideTrackingAccess({ orderId, subject: GUEST, pin });

    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) expect(attempt("0000")).toBe("wrong_pin");
    expect(attempt("0000")).toBe("locked");
    // Even the right pin is refused once locked.
    expect(attempt("1234")).toBe("locked");
  });

  it("frees the lock once the window passes", () => {
    const orderId = nextId();
    const attempt = (pin: string) => decideTrackingAccess({ orderId, subject: GUEST, pin });

    for (let i = 0; i <= MAX_PIN_ATTEMPTS; i++) attempt("0000");
    expect(attempt("1234")).toBe("locked");

    vi.advanceTimersByTime(PIN_ATTEMPT_WINDOW_MS + 1);
    expect(attempt("1234")).toBe("granted");
  });

  it("keeps each order's budget separate", () => {
    const spent = nextId();
    for (let i = 0; i <= MAX_PIN_ATTEMPTS; i++) {
      decideTrackingAccess({ orderId: spent, subject: GUEST, pin: "0000" });
    }
    expect(decideTrackingAccess({ orderId: spent, subject: GUEST, pin: "1234" })).toBe("locked");
    expect(decideTrackingAccess({ orderId: nextId(), subject: GUEST, pin: "1234" })).toBe(
      "granted",
    );
  });
});
