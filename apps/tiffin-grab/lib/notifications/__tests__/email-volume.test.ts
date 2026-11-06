import { describe, expect, it } from "vitest";
import type { EmailStream } from "@relay/email";
import { rollupVolume, type VolumeRow } from "../email-volume";

const streams: EmailStream[] = [
  { id: "t", label: "T", configSet: "a", kind: "untracked" },
  { id: "tt", label: "TT", configSet: "b", kind: "tracked" },
  { id: "m", label: "M", configSet: "c", kind: "marketing" },
];
const row = (p: Partial<VolumeRow>): VolumeRow => ({
  event: "order_created", campaign: false, send: 0, delivery: 0, delivery_delay: 0, open: 0, click: 0,
  bounce: 0, complaint: 0, reject: 0, rendering_failure: 0, ...p,
});

describe("rollupVolume", () => {
  it("maps campaign rows to marketing, tracked events to tracked, the rest to untracked", () => {
    const out = rollupVolume(
      [row({ campaign: true, event: null, send: 5, open: 2 }), row({ event: "order_created", send: 3 }), row({ event: "signup", send: 4 }), row({ event: "signup", send: 1 })],
      new Set(["order_created"]),
      streams,
    );
    expect(out).toEqual({ m: { send: 5, open: 2 }, tt: { send: 3 }, t: { send: 5 } });
  });

  it("drops rows whose stream is not configured", () => {
    expect(rollupVolume([row({ send: 1 })], new Set(["order_created"]), [streams[0]!])).toEqual({ t: {} });
  });
});
