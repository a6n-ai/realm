import { PriceTable } from "@/components/marketing/ui";
import { lengthLabel, money } from "@/lib/pricing/price-line";
import { getAppClock, getDefaultPrices } from "@/lib/services/app-settings.service";

/** The studio-wide length x weekday/weekend table, straight from app settings. */
export async function GlobalPriceTable() {
  const [table, { currency }] = await Promise.all([getDefaultPrices(), getAppClock()]);
  const rows = Object.entries(table)
    .filter(([key]) => key.startsWith("len:"))
    .map(([key, cell]) => [Number(key.slice(4)), cell] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([minutes, cell]) => [
      lengthLabel(minutes),
      cell.weekday != null ? money(cell.weekday, currency) : "-",
      cell.weekend != null ? money(cell.weekend, currency) : "-",
    ]);
  if (rows.length === 0) return <p className="xl-body">Prices are on request. Get in touch and we will help you plan.</p>;
  return <PriceTable caption="Per child" columns={["Duration", "Mon–Thu", "Fri–Sun"]} rows={rows} />;
}
