import type { getPayoutCandidates } from "../actions";

export type Candidate = Awaited<ReturnType<typeof getPayoutCandidates>>["rows"][number] & { added?: boolean };
