import type { PayoutCandidate } from "@/lib/services/customer-payouts.service";

export type Candidate = PayoutCandidate & { added?: boolean };
