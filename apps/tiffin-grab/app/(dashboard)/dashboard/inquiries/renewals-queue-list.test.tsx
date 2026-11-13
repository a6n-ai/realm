// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen, within } from "@testing-library/react";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { TooltipProvider } from "@foundry/ui/tooltip";
import type { RenewalRow } from "@/lib/renewals/renewals.service";
import { RenewalsQueueList } from "./renewals-queue-list";
vi.mock("../renewals/actions", () => ({
  setTrackStatusAction: vi.fn(async () => ({ ok: true })),
  addTrackNoteAction: vi.fn(async () => ({ ok: true })),
  logTrackActivityAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/inquiries",
  useSearchParams: () => new URLSearchParams(),
}));
const render = (ui: ReactElement) => rtlRender(<TimezoneProvider tz="America/Toronto"><TooltipProvider>{ui}</TooltipProvider></TimezoneProvider>);
const plan = (over: Partial<RenewalRow>): RenewalRow => ({
  orderPublicId: "ord_1", customerPublicId: "cus_1", code: "A1", customerName: "Asha", phone: "+16475550001",
  planName: "Plan", mealSize: "Regular", lastTiffin: "2026-11-20", planTotal: "100", status: "none", trial: false,
  track: null, trackSource: null, lostReason: null, nextFollowUpAt: null, laterBookedAt: null, lastActivity: null,
  priorPlans: 0, holds: 0, openTickets: 0, walletCoins: 0, totalSpent: "0", prevOrderTotal: null, ...over,
});
afterEach(cleanup);
describe("RenewalsQueueList row actions", () => {
  it("a renewed row shows Add note with the note icon and hides Set follow-up", () => {
    render(
      <RenewalsQueueList
        rows={[plan({ customerName: "Renewed Ria", orderPublicId: "ord_r", track: "renewed", trackSource: "staff" }), plan({ customerName: "Open Omar", orderPublicId: "ord_o", track: "follow_up", trackSource: "staff" })]}
        total={2}
        page={0}
        size={25}
        queue="open"
        today="2026-11-11"
        spec={[]}
      />,
    );
    const rowOf = (name: string) => screen.getAllByRole("row").find((r) => r.textContent?.includes(name))!;
    const renewedRow = rowOf("Renewed Ria");
    const openRow = rowOf("Open Omar");
    const addNote = within(renewedRow).getByRole("button", { name: "Add note" });
    expect(addNote.querySelector("svg")).toHaveClass("lucide-message-square-plus");
    expect(within(renewedRow).queryByRole("button", { name: "Set follow-up" })).toBeNull();
    expect(within(openRow).getByRole("button", { name: "Set follow-up" })).toBeInTheDocument();
  });
});
