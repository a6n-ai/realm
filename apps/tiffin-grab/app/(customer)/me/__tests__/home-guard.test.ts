// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// redirect() throws in the real runtime; mirror that so a stray redirect in the
// page is observable as a thrown NEXT_REDIRECT rather than a silent no-op.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/services/session-service", () => ({ currentUserId: vi.fn() }));
vi.mock("@/lib/services/app-settings.service", () => ({
  getAppSettings: vi.fn().mockResolvedValue({ timezone: "Asia/Kolkata" }),
}));
// Stub the DB-backed subscription read so this guard test never touches the real
// db/schema import graph (which itself transitively pulls in session-service and
// breaks the partial mock above).
vi.mock("@/lib/services/customer-deliveries.service", () => ({
  myActiveSubscriptions: vi.fn().mockResolvedValue([]),
  nextDeliveryByOrder: vi.fn().mockResolvedValue(new Map()),
}));
// The subscription section's Pause/Resume controls import these "use server" actions, which
// themselves pull in the full db/schema import graph — stub them for the same reason.
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({
  pauseMySubscription: vi.fn(),
  resumeMySubscription: vi.fn(),
}));

const { currentUserId } = await import("@/lib/services/session-service");
const MePage = (await import("../page")).default;
const mockCurrentUserId = currentUserId as unknown as ReturnType<typeof vi.fn>;

afterEach(cleanup);

describe("/me home shell", () => {
  it("redirects to /login when there is no session user (defense in depth)", async () => {
    mockCurrentUserId.mockResolvedValueOnce(null);
    await expect(MePage()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("renders the sectioned home (no longer a redirect to /me/deliveries) for a signed-in user", async () => {
    mockCurrentUserId.mockResolvedValueOnce(42n);

    // The old stub called redirect("/me/deliveries"); if that survived, render()
    // would never run because MePage() would throw first.
    render(await MePage());

    expect(screen.getByRole("heading", { name: /home/i, level: 1 })).toBeInTheDocument();
    // Resolved-Decision-#2 section order: subscription · browse · coupons · wallet · analytics.
    expect(screen.getByRole("heading", { name: /your subscription/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /browse plans/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /available coupons/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^wallet$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /your activity/i })).toBeInTheDocument();
  });
});
