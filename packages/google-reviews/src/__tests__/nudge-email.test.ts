import { describe, it, expect } from "vitest";
import { renderReviewNudgeEmail } from "../nudge-email";

const UNSUBSCRIBE_URL = "https://example.com/api/review-nudge/unsubscribe?email=a&token=b";

describe("renderReviewNudgeEmail", () => {
  it("addresses the customer by name", async () => {
    const r = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      customerName: "Priya",
      placeId: "ChIJabc",
      unsubscribeUrl: UNSUBSCRIBE_URL,
    });
    expect(r.html).toContain("Priya");
  });

  it("links to the Google write-review page", async () => {
    const r = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      customerName: "Priya",
      placeId: "ChIJabc",
      unsubscribeUrl: UNSUBSCRIBE_URL,
    });
    expect(r.html).toContain("https://search.google.com/local/writereview?placeid=ChIJabc");
  });

  it("names the business in the subject", async () => {
    const r = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      placeId: "ChIJabc",
      unsubscribeUrl: UNSUBSCRIBE_URL,
    });
    expect(r.subject).toContain("Puchkaman");
  });

  it("falls back to a neutral greeting with no customer name", async () => {
    const r = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      placeId: "ChIJabc",
      unsubscribeUrl: UNSUBSCRIBE_URL,
    });
    expect(r.html).toContain("Hi there");
  });

  it("produces a plaintext alternative alongside the HTML", async () => {
    const r = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      placeId: "ChIJabc",
      unsubscribeUrl: UNSUBSCRIBE_URL,
    });
    expect(r.text).toContain("Puchkaman");
    expect(r.text).not.toContain("<p>");
  });

  it("includes the unsubscribe link", async () => {
    const r = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      placeId: "ChIJabc",
      unsubscribeUrl: UNSUBSCRIBE_URL,
    });
    expect(r.html).toContain(UNSUBSCRIBE_URL);
  });
});
