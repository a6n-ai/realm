"use client";

import { CloverEmployeesSyncActions } from "@/components/admin/clover-employees-sync-actions";

// The users list needs the exact same Clover employee/account pull as the
// Employees page (same endpoint, same result shape) — reused wholesale rather
// than duplicating its apiFetch/toast/overlay logic in a second component.
export function SyncCloverUsersButton({ cloverConnected }: { cloverConnected: boolean }) {
  return <CloverEmployeesSyncActions cloverConnected={cloverConnected} />;
}
