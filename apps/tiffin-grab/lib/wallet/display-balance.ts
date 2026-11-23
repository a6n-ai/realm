import { cache } from "react";
import { walletService } from "@/lib/wallet/wallet.service";

// Display-only: the layout, wallet and refer pages render the same balance in one request. Money paths call walletService.balance directly.
export const displayBalance = cache((userId: bigint) => walletService.balance(userId));
