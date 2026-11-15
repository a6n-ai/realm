import { createAccessControl, createOrgRoles, createOrgStatement } from "@foundry/auth";
import type { ResourceLabel } from "@foundry/crm";
import { Role } from "@foundry/commons";

export const appStatement = {
  // This app's own user-management actions — see the same comment in puchkaman's
  // permissions.ts. Gating them on better-auth's `user` resource would also authorize
  // the plugin's ban/impersonate/remove endpoints, which are mounted unconditionally.
  staff: ["invite", "suspend", "remove"],
  order: ["read", "write", "cancel", "manage"],
  subscription: ["read", "write", "pause"],
  menu: ["read", "write", "publish"],
  finance: ["read", "refund", "charge"],
  holiday: ["read", "write"],
  // Open many private files with one link: one folder token covers a whole ticket/payment.
  files: ["bulkAccess"],
  settings: ["read", "write"],
  audit: ["read"],
  customer: ["read", "write", "export"],
  inquiry: ["read", "write", "import"],
  catalog: ["read", "write"],
  delivery: ["read", "write"],
  discount: ["read", "write"],
  ticket: ["read", "write"],
  analytics: ["read"],
  notification: ["read", "write", "send"],
  wallet: ["read", "give"],
} as const;

export const statement = createOrgStatement(appStatement);

export const ac = createAccessControl(statement);

// Today's member plus what requireStaff admits; Task 11 confirms against staff pages.
export const MEMBER_PERMISSIONS = {
  order: ["read", "write", "cancel"],
  subscription: ["read", "write", "pause"],
  menu: ["read"],
  finance: ["read", "charge"],
  inquiry: ["read", "write"],
  customer: ["read", "write", "export"],
  delivery: ["read"],
  ticket: ["read", "write"],
};

export const orgRoles = createOrgRoles(ac, appStatement, MEMBER_PERMISSIONS);

export const RESOURCE_LABELS: ResourceLabel[] = [
  { resource: "staff", label: "Staff", actions: [
    { action: "invite", label: "Invite staff" }, { action: "suspend", label: "Suspend staff" }, { action: "remove", label: "Remove staff" } ] },
  { resource: "order", label: "Orders", actions: [
    { action: "read", label: "View orders" }, { action: "write", label: "Create and edit orders" }, { action: "cancel", label: "Cancel orders" },
    { action: "manage", label: "Override deliveries, give free tiffins, bulk start" } ] },
  { resource: "subscription", label: "Subscriptions", actions: [
    { action: "read", label: "View subscriptions" }, { action: "write", label: "Edit subscriptions" }, { action: "pause", label: "Pause subscriptions" } ] },
  { resource: "menu", label: "Menu", actions: [
    { action: "read", label: "View menu" }, { action: "write", label: "Edit menu" }, { action: "publish", label: "Publish menu" } ] },
  { resource: "finance", label: "Finance", actions: [
    { action: "read", label: "View finances" }, { action: "refund", label: "Issue refunds" }, { action: "charge", label: "Charge payments" } ] },
  { resource: "holiday", label: "Holidays", actions: [
    { action: "read", label: "View holidays" }, { action: "write", label: "Edit holidays" } ] },
  { resource: "files", label: "Files", actions: [
    { action: "bulkAccess", label: "Open files in bulk" } ] },
  { resource: "settings", label: "Settings", actions: [
    { action: "read", label: "View settings" }, { action: "write", label: "Edit settings" } ] },
  { resource: "audit", label: "Audit log", actions: [
    { action: "read", label: "View audit log" } ] },
  { resource: "customer", label: "Customers", actions: [
    { action: "read", label: "View customers" }, { action: "write", label: "Edit customers" }, { action: "export", label: "Export customers" } ] },
  { resource: "inquiry", label: "Inquiries", actions: [
    { action: "read", label: "View inquiries" }, { action: "write", label: "Edit inquiries" }, { action: "import", label: "Import inquiries" } ] },
  { resource: "catalog", label: "Catalog", actions: [
    { action: "read", label: "View catalog" }, { action: "write", label: "Edit catalog" } ] },
  { resource: "delivery", label: "Deliveries", actions: [
    { action: "read", label: "View deliveries" }, { action: "write", label: "Edit deliveries" } ] },
  { resource: "discount", label: "Discounts", actions: [
    { action: "read", label: "View discounts" }, { action: "write", label: "Edit discounts" } ] },
  { resource: "ticket", label: "Support tickets", actions: [
    { action: "read", label: "View tickets" }, { action: "write", label: "Reply to tickets" } ] },
  { resource: "analytics", label: "Analytics", actions: [
    { action: "read", label: "View analytics" } ] },
  { resource: "notification", label: "Notifications", actions: [
    { action: "read", label: "View notifications" }, { action: "write", label: "Edit notifications" }, { action: "send", label: "Send notifications" } ] },
  { resource: "wallet", label: "Wallet", actions: [
    { action: "read", label: "View wallets" }, { action: "give", label: "Give coins" } ] },
];

// Unlike puchkaman, `user` exists here — checkout provisions customer accounts. It
// holds no dashboard permissions; it is the role a customer carries.
export const roles = {
  admin: ac.newRole({
    // An explicit subset, NOT a spread of adminAc.statements. See puchkaman's
    // permissions.ts for why: ban / impersonate / delete authorize plugin endpoints
    // this app does not mount, and granting them would bypass users.status and
    // usersService.softDelete over raw HTTP.
    //
    // `list` and `get` are withheld too, unlike puchkaman. They authorize
    // /admin/list-users and /admin/get-user, and this is the CUSTOMER origin — that
    // endpoint would page through every customer's PII without touching audit_log.
    // Nothing here needs them: the users page queries the database directly, so the
    // only effect of granting them would be an unaudited read channel.
    user: ["create", "set-role"],
    session: ["list", "revoke", "delete"],
    staff: ["invite", "suspend", "remove"],
    settings: ["read", "write"],
    audit: ["read"],
    order: ["read", "write", "cancel"],
    subscription: ["read", "write", "pause"],
    menu: ["read", "write", "publish"],
    finance: ["read", "refund", "charge"],
    holiday: ["read", "write"],
    files: ["bulkAccess"],
  }),
  member: ac.newRole({
    order: ["read", "write"],
    subscription: ["read", "write", "pause"],
    menu: ["read"],
    finance: ["read"],
  }),
  user: ac.newRole({}),
};

// Staff only. A customer account is created by checkout, never by an admin typing an
// email, so Role.USER is not offered even though the role exists.
export const INVITABLE_ROLES = [Role.ADMIN, Role.MEMBER] as const;
