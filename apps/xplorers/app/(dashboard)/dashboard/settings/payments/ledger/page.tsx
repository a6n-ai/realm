import { redirect } from "next/navigation";

export default function SettingsPaymentsLedgerRedirect() {
  redirect("/dashboard/finance/ledger");
}
