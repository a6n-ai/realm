import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { assembleLedger } = await import("../ledger");
import type { LedgerOptimoRow, LedgerOurRow } from "../ledger";
import type { OurSide } from "../reconcile-reason";

const side = (o: Partial<OurSide> = {}): OurSide => ({
  status: "scheduled", optimoCompletionStatus: null, optimoCompletionNote: null,
  mergedIntoDate: null, moved: false, everPushed: true, ...o,
});
const our = (id: string, phone: string | null, o: Partial<OurSide> = {}): LedgerOurRow => ({
  deliveryPublicId: id, customerName: `C ${id}`, phone, orderId: `SUB-${id}`,
  tiffinUnits: 1, ourStatus: "To be delivered", side: side(o),
});
const opt = (id: string, orderNo: string | null, phone: string, o: Partial<LedgerOptimoRow> = {}): LedgerOptimoRow => ({
  id, orderNo, phone, driver: "Driver 1", stopNumber: 1, status: "scheduled", ...o,
});

describe("assembleLedger", () => {
  it("one row per delivery, two same-day deliveries for one customer stay separate", () => {
    const l = assembleLedger({
      date: "2026-10-08",
      ours: [our("d1", "4165550000"), our("d2", "4165550000")],
      paymentHeld: [],
      optimo: [opt("o1", "d1", "4165550000"), opt("o2", "d2", "4165550000")],
    });
    expect(l.rows.filter((r) => r.deliveryPublicId).map((r) => r.deliveryPublicId)).toEqual(["d1", "d2"]);
    expect(l.rows.every((r) => r.group === "on_route")).toBe(true);
  });

  it("phone fallback only when exactly one unclaimed stop has that phone", () => {
    const one = assembleLedger({ date: "x", ours: [our("d1", "416-555-0001")], paymentHeld: [], optimo: [opt("o1", "Legacy 43", "4165550001")] });
    expect(one.rows.find((r) => r.deliveryPublicId === "d1")?.reason).toContain("(matched by phone)");

    const two = assembleLedger({
      date: "x",
      ours: [our("d1", "4165550001")],
      paymentHeld: [],
      optimo: [opt("o1", "Legacy 43", "4165550001"), opt("o2", "Legacy 44", "4165550001")],
    });
    const row = two.rows.find((r) => r.deliveryPublicId === "d1")!;
    expect(row.group).toBe("needs_action");
    expect(row.reason).toBe("Several OptimoRoute stops share this phone");
    expect(two.rows.filter((r) => r.group === "not_ours")).toHaveLength(0);
  });

  it("two of our rows sharing a phone with one legacy stop are both flagged, stop not shown twice", () => {
    const l = assembleLedger({
      date: "x",
      ours: [our("d1", "4165550001"), our("d2", "4165550001")],
      paymentHeld: [],
      optimo: [opt("o1", "Legacy 43", "4165550001")],
    });
    expect(l.rows).toHaveLength(2);
    expect(l.rows.every((r) => r.reason === "Several OptimoRoute stops share this phone")).toBe(true);
    expect(l.rows.filter((r) => r.group === "not_ours")).toHaveLength(0);
  });

  it("stops that match nothing of ours are Not ours", () => {
    const l = assembleLedger({ date: "x", ours: [], paymentHeld: [], optimo: [opt("o9", "Other biz 1", "9990001111")] });
    expect(l.rows).toHaveLength(1);
    expect(l.rows[0]).toMatchObject({ group: "not_ours", optimoOrderNo: "Other biz 1", onLabels: false });
    expect(l.rows[0]).toMatchObject({ customerName: "Other biz 1", phone: null });
  });

  it("payment-held deliveries are listed as needs action, off labels", () => {
    const l = assembleLedger({
      date: "x",
      ours: [],
      paymentHeld: [{ deliveryPublicId: "d7", orderPublicId: "o7", customerName: "P", phone: null, paymentStatus: "pending_verification", amount: "10", reference: null }],
      optimo: [],
    });
    expect(l.rows[0]).toMatchObject({ deliveryPublicId: "d7", group: "needs_action", reason: "Not sent — payment needs verification", onLabels: false });
  });

  it("labels total equals the scheduled rows, and every group is counted", () => {
    const l = assembleLedger({
      date: "x",
      ours: [our("d1", null), our("d2", null, { everPushed: false }), our("d3", null, { status: "skipped" })],
      paymentHeld: [],
      optimo: [opt("o1", "d1", "")],
    });
    expect(l.labelsCount).toBe(2);
    expect(l.rows.filter((r) => r.onLabels)).toHaveLength(2);
    expect(l.counts).toEqual({ on_route: 1, done: 0, needs_action: 1, not_today: 1, not_ours: 0 });
  });
});
