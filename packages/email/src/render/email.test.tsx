import { describe, expect, it } from "vitest";
import { renderEmailTemplate, renderInApp } from "./email";

describe("render-email", () => {
  it("interpolates + renders markdown to HTML", async () => {
    const out = await renderEmailTemplate({
      subject: "Order {{order.code}}",
      body: "# Hi {{order.customerName}}\n\nYour order **{{order.code}}** is active.",
      vars: { order: { code: "TG-9", customerName: "Sam" } },
    });
    expect(out.subject).toBe("Order TG-9");
    expect(out.html).toContain("TG-9");
    expect(out.html.toLowerCase()).toContain("<html");
    expect(out.text).toContain("TG-9");
  });

  it("renders in-app title + plaintext body", () => {
    const out = renderInApp({
      subject: "Order {{order.code}}",
      body: "Your order {{order.code}} is active.",
      vars: { order: { code: "TG-9" } },
    });
    expect(out.title).toBe("Order TG-9");
    expect(out.body).toBe("Your order TG-9 is active.");
  });
});
