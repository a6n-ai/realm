"use client";

import { useCallback, useEffect, useId, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { writeFranchiseCookie } from "@foundry/design-system";
import { Btn } from "@/components/brutal/shared";
import { useCart } from "@/components/cart/cart-provider";
import { useModalFocus } from "@/lib/a11y/use-modal-focus";

/**
 * Puts a cross-store cart to the customer instead of carrying it silently.
 *
 * Each store has its own menu and prices, so after a location switch the
 * existing lines may not be orderable here. Neither choice loses anything
 * unasked: going back keeps the cart exactly as it was, and emptying it is the
 * one explicit, labelled destructive action. Escape takes the safe path.
 */
export function CartFranchiseGuard() {
  const { franchiseConflict, count, emptyCartForCurrentStore } = useCart();
  const router = useRouter();
  const [switching, startTransition] = useTransition();
  const panel = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const open = franchiseConflict !== null;
  useModalFocus(panel, open);

  const from = franchiseConflict?.from ?? null;
  const to = franchiseConflict?.to ?? null;

  const keepCart = useCallback(() => {
    if (!from || switching) return;
    writeFranchiseCookie(from.clientCode);
    // The layout re-resolves the store on refresh; once it matches the cart again
    // the conflict clears and this dialog closes on its own.
    startTransition(() => router.refresh());
  }, [from, switching, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") keepCart();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, keepCart]);

  if (!from || !to) return null;

  const items = `${count} item${count === 1 ? "" : "s"}`;
  const here = to.label ?? "this location";

  return (
    <div className="mod-sheet-root">
      {/* Not dismissable by clicking outside: this is a decision, not a notice. */}
      <div className="mod-sheet-backdrop" style={{ cursor: "default" }} aria-hidden="true" />
      <section
        ref={panel}
        className="mod-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <div className="mod-sheet__head">
          <h2 id={titleId} className="display" style={{ fontSize: "1.45rem", margin: 0 }}>
            Switch your cart to {here}?
          </h2>
        </div>
        <div className="mod-sheet__body">
          <p id={bodyId} style={{ margin: 0, fontWeight: 600 }}>
            {from.label
              ? `Your cart has ${items} from ${from.label}. ${here} has its own menu and prices, so those items may not be available here.`
              : `Your cart has ${items} added before you chose a location. ${here} has its own menu and prices, so they may not be available here.`}
          </p>
        </div>
        <div className="mod-sheet__foot" style={{ display: "grid", gap: 10 }}>
          <Btn variant="green" block onClick={emptyCartForCurrentStore}>
            Empty cart &amp; order from {here}
          </Btn>
          <Btn variant="white" block onClick={keepCart} aria-label={switching ? "Switching back…" : undefined}>
            {switching ? "Switching back…" : from.label ? `Keep my cart, go back to ${from.label}` : "Keep my cart"}
          </Btn>
        </div>
      </section>
    </div>
  );
}
