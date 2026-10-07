import { ModeToggle } from "@/components/mode-toggle";
import { CoinChip } from "./coin-chip";

export function CustomerHeaderActions({ coinBalance }: { coinBalance: number | string | null }) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {coinBalance != null ? <CoinChip balance={coinBalance} /> : null}
      <ModeToggle />
    </div>
  );
}
