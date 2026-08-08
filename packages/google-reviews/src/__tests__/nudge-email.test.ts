import { describe, it, expect } from "vitest";
import { renderReviewNudgeEmail } from "../nudge-email";

describe("renderReviewNudgeEmail", () => {
  it("addresses the customer by name", async () => {
    const r = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      customerName: "Priya",
      placeId: "ChIJabc",
    });
    expect(r.html).toContain("Priya");
  });

  it("links to the Google write-review page", async () => {
    const r = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      customerName: "Priya",
      placeId: "ChIJabc",
    });
    expect(r.html).toContain("https://search.google.com/local/writereview?placeid=ChIJabc");
  });

  it("names the business in the subject", async () => {
    const r = await renderReviewNudgeEmail({ businessName: "Puchkaman", placeId: "ChIJabc" });
    expect(r.subject).toContain("Puchkaman");
  });

  it("falls back to a neutral greeting with no customer name", async () => {
    const r = await renderReviewNudgeEmail({ businessName: "Puchkaman", placeId: "ChIJabc" });
    expect(r.html).toContain("Hi there");
  });

  it("produces a plaintext alternative alongside the HTML", async () => {
    const r = await renderReviewNudgeEmail({ businessName: "Puchkaman", placeId: "ChIJabc" });
    expect(r.text).toContain("Puchkaman");
    expect(r.text).not.toContain("<p>");
  });
});
