// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));
vi.mock("@foundry/design-system/timezone-provider", () => ({ useTimezone: () => "UTC" }));
vi.mock("../actions", () => ({ clearFollowUp: async () => ({ ok: true }), logActivity: async () => ({ ok: true }) }));
vi.mock("../_leads/status-dialog", () => ({ NoteDialog: () => null, StatusMenu: () => null }));
vi.mock("../_leads/composer", () => ({ InlineComposer: () => null }));
vi.mock("@/components/dashboard/next-item/contact-chips", () => ({ ContactChips: () => null, whatsappHref: () => undefined }));
vi.mock("@/components/dashboard/app-breadcrumbs", () => ({ BreadcrumbLabel: () => null }));
vi.mock("./inquiry-timeline", () => ({ InquiryTimeline: () => null }));
vi.mock("./convert-sheet", () => ({ ConvertSheet: () => null }));
vi.mock("./next-step-card", () => ({ NextStepCard: () => null }));
vi.mock("./edit-contact-dialog", () => ({ EditContactDialog: () => null }));
vi.mock("@/components/dashboard/reassign/reassign-control", () => ({ ReassignControl: () => null }));

const { InquiryDetailClient } = await import("./detail-client");

afterEach(cleanup);

describe("InquiryDetailClient Details toggle", () => {
  it("hides the closed Details panel on mobile only, so desktop always shows it", () => {
    render(
      <InquiryDetailClient
        inquiryId="INQ-1"
        subStatus={null}
        nextFollowUpAt={null}
        dayStart={0}
        dayEnd={1}
        createdAt={0}
        now={0}
        currency="CAD"
        canEditContact={true}
        contact={{ fullName: "Ana Ray", phone: null, whatsappPhone: null, email: null, leadNumber: null }}
        sourceLabel="Web"
        owner={{ publicId: null, name: null }}
        reassign={null}
        notes={null}
        interest={{ planInterest: null, mealSizeInterest: null, personsInterest: null, frequencyKeyInterest: null, eatingDaysInterest: null, preferredStart: null, postalCode: null, quotedPrice: null }}
        activities={[]}
        catalog={{ plans: [], mealSizes: [], frequencies: [], durations: [] }}
        enabledSlots={[]}
        prefill={{}}
        unmatched={[]}
        existing={null}
      />,
    );
    expect(screen.getByRole("button", { name: "Details" })).toBeInTheDocument();
    const content = screen.getByRole("heading", { name: "Interest" }).closest("[data-state]");
    expect(content).toHaveAttribute("data-state", "closed");
    expect(content).toHaveClass("max-lg:data-[state=closed]:hidden", "lg:block");
  });
});
