import { makeWalletTables } from "@realm/wallet/schema";
import { appEvent } from "./events";
import { ledgerDirection, orders } from "./orders";
import { users } from "./auth";

// Puchkaman's app_event is the app-wide notification catalog, not a wallet
// list — it stays exactly as it is and the factory takes it as a parameter.
export const { walletLedger, eventPayout, coinRate } = makeWalletTables({
  users,
  orders,
  appEvent,
  ledgerDirection,
});
