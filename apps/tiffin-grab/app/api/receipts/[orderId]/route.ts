import { isStaffRole } from "@/lib/auth/roles";
import { NotFoundError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { loadReceipt } from "@/lib/billing/receipt";
import { renderReceiptPdf } from "@/lib/billing/receipt-pdf";
import { verifyReceiptSignature } from "@/lib/billing/receipt-link";
import { assertOwnsOrder } from "@/lib/deliveries/customer-deliveries.service";
import { assertOrderVisible } from "@/lib/orders/orders.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { currentUserId } from "@/lib/services/session-service";

// A signed link (the emailed attachment) opens without a session. Otherwise staff see orders in
// their own organizations only (the PDF carries name, address and payment references), and a
// customer sees their own.
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const url = new URL(request.url);
  if (!verifyReceiptSignature(orderId, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    try {
      const session = await getSession();
      if (!session) return new Response("Not found", { status: 404 });
      if (isStaffRole(session.user.role)) {
        await assertOrderVisible(orderId, await resolveSessionVisibleOrgIds(session));
      } else {
        const userId = await currentUserId();
        if (userId == null) return new Response("Not found", { status: 404 });
        await assertOwnsOrder(userId, orderId);
      }
    } catch (e) {
      if (e instanceof NotFoundError) return new Response("Not found", { status: 404 });
      throw e;
    }
  }

  const receipt = await loadReceipt(orderId);
  if (!receipt) return new Response("Not found", { status: 404 });
  const bytes = await renderReceiptPdf(receipt);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.has("inline") ? "inline" : "attachment"}; filename="TiffinGrab-receipt-${receipt.code}.pdf"`,
      // Name, address and payment details: never cached by a proxy.
      "Cache-Control": "no-store, private",
    },
  });
}
