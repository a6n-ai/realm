import type { ReferralFriendStatus } from "@/lib/services/referrals.service";

// Plain module, not "use client": the server page builds its filter facets from this.
export const REFERRAL_STATUS: Record<ReferralFriendStatus, { label: string; variant: "info-light" | "warning-light" | "success-light" | "destructive-light" }> = {
  joined: { label: "Joined", variant: "info-light" },
  ordered: { label: "Ordered", variant: "warning-light" },
  rewarded: { label: "Rewarded", variant: "success-light" },
  reversed: { label: "Taken back", variant: "destructive-light" },
};
