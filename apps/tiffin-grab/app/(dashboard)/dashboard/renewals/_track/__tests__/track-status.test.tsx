// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { setTrackStatusAction } from "../../actions";
import { TrackStatusBoard, TrackStatusPill } from "../track-status";

vi.mock("../../actions", () => ({ setTrackStatusAction: vi.fn(async () => ({ ok: true })) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const render = (ui: ReactElement) => rtlRender(<TimezoneProvider tz="America/Toronto">{ui}</TimezoneProvider>);
const base = { orderPublicId: "ord_1", customerPublicId: "cus_1", source: null } as const;

beforeEach(() => vi.mocked(setTrackStatusAction).mockClear());
afterEach(cleanup);

describe("TrackStatusPill", () => {
  it("shows the label and an Auto suffix for an auto status", () => {
    render(<TrackStatusPill status="pending_payment" source="auto" />);
    expect(screen.getByText("Pending Payment")).toBeInTheDocument();
    expect(screen.getByText("Auto")).toBeInTheDocument();
  });
});

describe("TrackStatusBoard", () => {
  it("asks for a lost reason on Not renewed and saves it with the status", async () => {
    render(<TrackStatusBoard {...base} status={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Not renewed" }));

    expect(screen.getByText("Not renewed reason")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Price" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark not renewed" }));

    await waitFor(() => expect(setTrackStatusAction).toHaveBeenCalledWith("ord_1", "cus_1", { status: "not_renewed", lostReason: "price" }));
  });

  it("hides the follow-up picker when the target status is closed", () => {
    render(<TrackStatusBoard {...base} status={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Renewed" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Next follow-up")).toBeNull();
  });

  it("shows the follow-up picker for an open status", () => {
    render(<TrackStatusBoard {...base} status={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Expected" }));

    expect(screen.getByText("Next follow-up")).toBeInTheDocument();
  });
});
