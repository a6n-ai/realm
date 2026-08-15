import { describe, expect, it } from "vitest";
import { walletService, type BusinessEvent } from "../wallet.service";

describe("wallet service wiring", () => {
  it("exposes the methods callers need", () => {
    expect(typeof walletService.balance).toBe("function");
    expect(typeof walletService.award).toBe("function");
    expect(typeof walletService.activeRate).toBe("function");
    expect(typeof walletService.moneyValue).toBe("function");
  });

  it("narrows BusinessEvent to puchkaman's app_event values, not `string`", () => {
    // Compile-time assertion: if BusinessEvent ever widens to `string` (e.g.
    // the package's generic stops inferring from the injected tables), this
    // fails to typecheck rather than silently accepting a misspelled event
    // that finds no payout row and awards nothing.
    type IsNarrow<T> = string extends T ? false : true;
    const narrow: IsNarrow<BusinessEvent> = true;
    expect(narrow).toBe(true);

    const valid: BusinessEvent = "order_placed";
    expect(valid).toBe("order_placed");
  });
});
