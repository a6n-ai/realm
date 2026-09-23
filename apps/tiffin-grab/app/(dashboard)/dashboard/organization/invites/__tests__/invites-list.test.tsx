// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { toast } from "sonner";
import { InvitesList } from "../invites-list";

vi.mock("../../users/actions", () => ({ cancelInvitation: vi.fn(), resendInvite: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// DataTable reads "q" URL state via next/navigation hooks; stub them for jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => "/x",
  useSearchParams: () => new URLSearchParams(),
}));

// DataTable renders both a desktop table and a mobile card in parallel, so
// queries scope to the desktop table (.md\:block) to avoid duplicate matches.
function desktopScope(container: HTMLElement) {
  const table = container.querySelector(".md\\:block");
  return within(table as HTMLElement);
}

describe("InvitesList", () => {
  it("renders a pending invite with a Cancel action and no Resend action", () => {
    const { container } = render(
      <InvitesList
        rows={[
          { id: "inv_1", userId: "user_1", email: "a@x.com", role: "member", status: "pending", expiresAt: new Date(Date.now() + 86400000).toISOString(), organizationId: "org_1" },
        ]}
      />,
    );
    const scope = desktopScope(container);
    expect(scope.getByText("a@x.com")).toBeTruthy();
    expect(scope.getByRole("button", { name: /cancel/i })).toBeTruthy();
    expect(scope.queryByRole("button", { name: /resend/i })).toBeNull();
  });

  it("renders an expired invite with a Resend action", () => {
    const { container } = render(
      <InvitesList
        rows={[
          { id: "inv_2", userId: "user_2", email: "b@x.com", role: "member", status: "pending", expiresAt: new Date(Date.now() - 1000).toISOString(), organizationId: "org_1" },
        ]}
      />,
    );
    const scope = desktopScope(container);
    expect(scope.getByText(/expired/i)).toBeTruthy();
    expect(scope.getByRole("button", { name: /resend/i })).toBeTruthy();
  });

  it("shows an empty state with zero invitations", () => {
    const { container } = render(<InvitesList rows={[]} />);
    const scope = desktopScope(container);
    expect(scope.getByText(/no pending invites/i)).toBeTruthy();
  });
});

describe("InvitesList cancel failure", () => {
  it("toasts an error instead of throwing when cancelInvitation rejects (already-accepted race)", async () => {
    const { cancelInvitation } = await import("../../users/actions");
    vi.mocked(cancelInvitation).mockRejectedValueOnce(new Error("already accepted"));

    const { container } = render(
      <InvitesList
        rows={[
          { id: "inv_3", userId: "user_3", email: "c@x.com", role: "member", status: "pending", expiresAt: new Date(Date.now() + 86400000).toISOString(), organizationId: "org_1" },
        ]}
      />,
    );
    const scope = desktopScope(container);
    await userEvent.click(scope.getByRole("button", { name: /cancel/i }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not cancel/i));
  });
});

describe("InvitesList mobile card", () => {
  it("renders email, status, role, and expires date in the mobile card", () => {
    const { container } = render(
      <InvitesList
        rows={[
          { id: "inv_4", userId: "user_4", email: "d@x.com", role: "member", status: "pending", expiresAt: new Date(Date.now() + 86400000).toISOString(), organizationId: "org_1" },
        ]}
      />,
    );
    const card = container.querySelector(".md\\:hidden");
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    expect(scope.getByText("d@x.com")).toBeTruthy();      // email
    expect(scope.getByText("member")).toBeTruthy();       // role
    expect(scope.getByText(/pending/i)).toBeTruthy();     // status badge
    expect(scope.getByText("Role")).toBeTruthy();         // role label
    expect(scope.getByText("Status")).toBeTruthy();       // status label
  });
});
