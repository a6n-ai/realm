import { renderEmailTemplate } from "@realm/email";
import { writeReviewUrl } from "./nudge";

const SUBJECT = "How was your order from {{businessName}}?";

const BODY = `{{greeting}},

Thanks for ordering from {{businessName}}. If you enjoyed it, would you leave us a Google review? It takes about a minute and helps enormously.

[Leave a Google review]({{reviewUrl}})

Thank you,
{{businessName}}`;

export async function renderReviewNudgeEmail(input: {
  businessName: string;
  customerName?: string;
  placeId: string;
}): Promise<{ subject: string; html: string; text: string }> {
  return renderEmailTemplate({
    subject: SUBJECT,
    body: BODY,
    appName: input.businessName,
    vars: {
      businessName: input.businessName,
      greeting: input.customerName?.trim() ? `Hi ${input.customerName.trim()}` : "Hi there",
      reviewUrl: writeReviewUrl(input.placeId),
    },
  });
}
