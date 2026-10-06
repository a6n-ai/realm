"use client";

import { useEffect } from "react";
import { claimInviteAction } from "@/app/(customer)/me/friends/actions";

/** Mounted only while an invite cookie exists; a server action can clear it, a layout cannot. */
export function ClaimInvite() {
  useEffect(() => {
    void claimInviteAction();
  }, []);
  return null;
}
