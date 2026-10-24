import { NotFoundError } from "@foundry/commons";
import { loadReceipt } from "@/lib/billing/receipt";
import { renderReceiptPdf } from "@/lib/billing/receipt-pdf";
import { verifyReceiptSignature } from "@/lib/billing/receipt-link";
import { assertCanManageOrder } from "@/lib/services/customer-deliveries.service";

// A signed link (the emailed attachment) opens without a session; otherwise the owner or staff.
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const url = new URL(request.url);
  if (!verifyReceiptSignature(orderId, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    try {
      await assertCanManageOrder(orderId);
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
