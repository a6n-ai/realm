import { configCache } from "@/lib/cache";

/** walletService.activeRate reads through this; saveCoinRate evicts it, so a new rate applies at once. */
export const coinRateCache = configCache("coin-rate");
