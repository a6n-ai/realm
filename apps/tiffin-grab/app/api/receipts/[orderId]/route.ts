import { isStaffRole } from "@/lib/roles";
import { NotFoundError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { loadReceipt } from "@/lib/billing/receipt";
import { renderReceiptPdf } from "@/lib/billing/receipt-pdf";
import { verifyReceiptSignature } from "@/lib/billing/receipt-link";
import { loadOrderOwnership, ownsOrder, staffSeesOrder } from "@/lib/account/order-access";

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
      const order = await loadOrderOwnership(orderId);
      if (!order) throw new NotFoundError("Order not found");
      const allowed = isStaffRole(session.user.role) ? await staffSeesOrder(session, order) : await ownsOrder(order);
      if (!allowed) throw new NotFoundError("Order not found");
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
