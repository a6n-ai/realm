import { describe, expect, it } from "vitest";
import { parseSupportHours, supportHoursView, type SupportHours } from "../support-hours";

const TZ = "America/Toronto";
// Mon–Fri 9–18, Sat 10–14, Sun closed.
const cfg: SupportHours = {
  days: [null, ...Array(5).fill({ open: "09:00", close: "18:00" }), { open: "10:00", close: "14:00" }],
  replyWithinHours: 2,
};
// 2026-10-14 is a Wednesday; Toronto is UTC-4 in October.
const at = (iso: string) => Date.parse(`${iso}-04:00`);

describe("supportHoursView", () => {
  it("is null until a day is set", () => {
    expect(supportHoursView({ days: Array(7).fill(null), replyWithinHours: 2 }, TZ)).toBeNull();
  });

  it("reads open, before opening, after closing and across the closed day", () => {
    expect(supportHoursView(cfg, TZ, at("2026-10-14T12:00:00"))).toMatchObject({ open: true, status: "Open now until 6 pm" });
    expect(supportHoursView(cfg, TZ, at("2026-10-14T08:30:00"))?.status).toBe("Closed now. Opens today at 9 am");
    expect(supportHoursView(cfg, TZ, at("2026-10-14T18:00:00"))?.status).toBe("Closed now. Opens tomorrow at 9 am");
    // Saturday after close: Sunday is off, so Monday.
    expect(supportHoursView(cfg, TZ, at("2026-10-17T15:00:00"))?.status).toBe("Closed now. Opens Mon at 9 am");
  });

  it("lists the week Monday first and words the reply time", () => {
    const v = supportHoursView(cfg, TZ, at("2026-10-14T12:00:00"))!;
    expect(v.week.map((r) => r.day)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(v.week[5].hours).toBe("10 am – 2 pm");
    expect(v.week[6].hours).toBe("Closed");
    expect(v.week.find((r) => r.today)?.day).toBe("Wed");
    expect(v.reply).toBe("We usually reply within 2 hours during support hours");
    expect(v.detail).toBe("Until 6 pm today");
    expect(v.groups).toEqual([
      { days: "Mon – Fri", hours: "9 am – 6 pm", open: true },
      { days: "Sat", hours: "10 am – 2 pm", open: true },
      { days: "Sun", hours: "Closed", open: false },
    ]);
  });
});

describe("parseSupportHours", () => {
  it("defaults garbage to nothing set and rejects a window that ends before it starts", () => {
    expect(parseSupportHours(null)).toEqual({ days: Array(7).fill(null), replyWithinHours: null });
    expect(() => parseSupportHours({ days: [{ open: "18:00", close: "09:00" }] })).toThrow("Sun");
    expect(() => parseSupportHours({ days: [], replyWithinHours: 0 })).toThrow("Reply time");
  });
});
