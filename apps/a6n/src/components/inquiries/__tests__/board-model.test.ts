import { describe, expect, test } from "vitest";
import type { BoardColumn } from "../../../lib/inquiries/repository";
import { STAGES } from "../../../lib/inquiries/stages";
import { dropAction, moveCard } from "../board-model";

describe("dropAction", () => {
  test("dropping on the same column does nothing", () => expect(dropAction("new", "new")).toBe("noop"));
  test("open to open changes at once", () => expect(dropAction("new", "negotiating")).toBe("change"));
  test("lost opens the reason dialog, won asks to confirm", () => {
    expect(dropAction("contacted", "lost")).toBe("lost");
    expect(dropAction("contacted", "won")).toBe("won");
  });
  test("a closed card opens Reopen wherever it lands", () => {
    expect(dropAction("won", "new")).toBe("reopen");
    expect(dropAction("lost", "won")).toBe("reopen");
    expect(dropAction("won", "won")).toBe("noop");
  });
});

const card = (id: string, stage: string) => ({ id, stage, contactName: id, companyName: null, phone: null, source: "Cold", ownerId: null, ownerName: null, ownerRemoved: false, nextFollowUpAt: null, overdue: false });
const cols = (): BoardColumn[] => STAGES.map((stage) => ({ stage, count: stage === "new" ? 2 : 0, cards: stage === "new" ? [card("a", "new"), card("b", "new")] : [] }));

describe("moveCard", () => {
  test("moves the card to the top of the target and shifts both counts", () => {
    const next = moveCard(cols(), "a", "contacted");
    expect(next.find((c) => c.stage === "new")).toMatchObject({ count: 1, cards: [{ id: "b" }] });
    expect(next.find((c) => c.stage === "contacted")).toMatchObject({ count: 1, cards: [{ id: "a", stage: "contacted" }] });
  });
  test("an unknown card or the same stage leaves the board untouched", () => {
    const before = cols();
    expect(moveCard(before, "zzz", "contacted")).toBe(before);
    expect(moveCard(before, "a", "new")).toBe(before);
  });
});
