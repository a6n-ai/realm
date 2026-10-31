import type { getCoinGrantGroupAction, getPayoutCandidates } from "../actions";

export type Candidate = Awaited<ReturnType<typeof getPayoutCandidates>>["rows"][number] & { added?: boolean };
export type GrantGroup = NonNullable<Awaited<ReturnType<typeof getCoinGrantGroupAction>>>;
export type GrantMember = GrantGroup["members"][number];
