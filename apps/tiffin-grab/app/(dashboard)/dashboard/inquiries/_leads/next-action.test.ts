import { describe, it, expect } from "vitest";
import { nextAction } from "./next-action";

const call = { label: "Log a call", action: { kind: "activity", activity: "call" } };
const followUp = { label: "Set a follow-up", action: { kind: "status" } };
const convert = { label: "Convert to order", action: { kind: "convert" } };
const view = { label: "View order", action: { kind: "view_order" } };
const reopen = { label: "Reopen", action: { kind: "status" } };

describe("nextAction", () => {
  it.each([[null, call], ["no_response", call], ["responded", followUp], ["future", followUp], ["persistent", followUp],
    ["expected", convert], ["pending_payment", convert], ["took_plan", view], ["took_trial", view],
    ["lost", reopen], ["undeliverable", reopen]] as const)("%s", (sub, want) => {
    expect(nextAction(sub)).toEqual(want);
  });
});
