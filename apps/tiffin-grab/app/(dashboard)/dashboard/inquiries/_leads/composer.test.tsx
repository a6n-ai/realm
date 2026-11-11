// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  addNote: vi.fn(async () => ({ ok: true })),
  logActivity: vi.fn(async () => ({ ok: true })),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("../actions", () => actions);

const { Composer } = await import("./composer");

afterEach(cleanup);
beforeEach(() => {
  actions.addNote.mockClear();
  actions.logActivity.mockClear();
});

describe("Composer", () => {
  it("keeps Save disabled until a note has text, then saves it through addNote", async () => {
    render(<Composer inquiryId="INQ-1" timeZone="UTC" />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Add a note"), { target: { value: "Asked about Saturday" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(actions.addNote).toHaveBeenCalledWith("INQ-1", "Asked about Saturday"));
    expect(actions.logActivity).not.toHaveBeenCalled();
  });

  it("logs a call outcome with a selected outcome", async () => {
    render(<Composer inquiryId="INQ-2" timeZone="UTC" />);
    await userEvent.click(screen.getByRole("tab", { name: "Call outcome" }));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Voicemail" }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(actions.logActivity).toHaveBeenCalledWith("INQ-2", { type: "call", outcome: "Voicemail", note: undefined }));
    expect(actions.addNote).not.toHaveBeenCalled();
  });
});
