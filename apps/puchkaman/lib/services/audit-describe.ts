/**
 * Human-readable labels for audit_log rows.
 * Custom admin actions stash `_action` in `changes`; CRUD uses operation + entity.
 */
import { AUTH_AUDIT_LABELS } from "@realm/auth";

const ACTION_LABELS: Record<string, string> = {
  // Auth security events, shared with tiffin-grab via @realm/auth so both apps
  // label the same vocabulary identically.
  ...AUTH_AUDIT_LABELS,
  clover_install: "Installed Clover plugin",
  clover_uninstall: "Uninstalled Clover plugin",
  clover_connect: "Connected Clover merchant",
  clover_disconnect: "Disconnected Clover",
  clover_sync_pull: "Pulled products from Clover",
  clover_sync_push: "Pushed products to Clover",
  clover_sync_one_pull: "Pulled product from Clover",
  clover_sync_one_push: "Pushed product to Clover",
  clover_link: "Linked product to Clover item",
  clover_unlink: "Unlinked product from Clover",
  clover_resolve_ambiguous: "Resolved Clover sync match",
  clover_catalog_pull: "Pulled Clover catalog",
  clover_catalog_push: "Pushed categories to Clover",
  clover_employees_pull: "Synced Clover employees",
  order_assign_employee: "Assigned order employee",
  // Written by the customer from the public tracking page, so these rows have
  // no actor — the trail shows them with a blank actor by design.
  tracking_cancel_requested: "Customer requested cancellation",
  tracking_note_added: "Customer added a note",
  payment_check_status: "Checked payment status",
  uber_images_sync: "Synced Uber Eats images",
  uber_resolve_duplicate: "Resolved Uber image duplicate",
  uber_apply_pending: "Applied Uber pending sync",
};

type AuditOperation =
  | "create"
  | "update"
  | "delete"
  | "read"
  | "login"
  | "logout"
  | "login_failed";

export function describeAuditAction(row: {
  entity: string;
  operation: string;
  changes: Record<string, unknown> | null;
}): string {
  const action = row.changes?._action;
  if (typeof action === "string" && ACTION_LABELS[action]) {
    return ACTION_LABELS[action];
  }
  if (typeof action === "string") {
    return action.replaceAll("_", " ");
  }

  const op = row.operation as AuditOperation;
  switch (op) {
    case "create":
      return `Created ${row.entity}`;
    case "update":
      return `Updated ${row.entity}`;
    case "delete":
      return `Deleted ${row.entity}`;
    case "read":
      return `Viewed ${row.entity}`;
    case "login":
      return "Signed in";
    case "logout":
      return "Signed out";
    case "login_failed":
      return "Failed sign-in";
    default: {
      const _exhaustive: never = op;
      return String(_exhaustive);
    }
  }
}
