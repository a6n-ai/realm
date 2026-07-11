import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/services/app-settings.service", () => ({
  getAppSettings: vi.fn().mockResolvedValue({ timezone: "Asia/Kolkata", cutoffHour: 18, currency: "INR" }),
}));
// next/navigation's redirect() throws in the real runtime; mirror that so the
// layout's control flow (throw → never reach the JSX below) is exercised.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const { getSession } = await import("@/lib/auth/session");
const CustomerLayout = (await import("../layout")).default;
const mockGetSession = getSession as unknown as ReturnType<typeof vi.fn>;

describe("(customer) layout guard", () => {
  it("redirects to /login when there is no session", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    await expect(CustomerLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("redirects staff (role member) to /dashboard", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { role: "member" } });
    await expect(CustomerLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("redirects admin to /dashboard", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { role: "admin" } });
    await expect(CustomerLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("renders children for a customer (role user)", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { role: "user" } });
    const result = await CustomerLayout({ children: "hello" });
    expect(result).toBeTruthy();
  });
});
