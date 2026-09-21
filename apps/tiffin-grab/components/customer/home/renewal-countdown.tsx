import { Pill } from "@/components/customer/kit";

export function RenewalCountdown({ daysLeft }: { daysLeft: number }) {
  const label = daysLeft <= 0 ? "Renew now" : daysLeft === 1 ? "1 day to renew" : `${daysLeft} days to renew`;
  return <Pill tone={daysLeft <= 3 ? "vac" : "ok"}>{label}</Pill>;
}
