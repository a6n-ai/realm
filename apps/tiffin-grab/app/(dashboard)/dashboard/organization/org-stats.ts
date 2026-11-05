import {
  Building2Icon,
  CheckCircle2Icon,
  ClockIcon,
  KeyRoundIcon,
  MailIcon,
  MailCheckIcon,
  MailXIcon,
  ShieldIcon,
  StoreIcon,
  UserCheckIcon,
  UserIcon,
  UsersIcon,
  UserXIcon,
} from "lucide-react";
import type { StatCardItem } from "@/components/dashboard/stat-cards";
import type { MemberRow } from "./members/members-query";
import type { InviteRow } from "./invites/invites-list";

type Client = { memberCount: number; isBrand: boolean };

// One person can sit in several orgs; count people, not memberships.
function people(rows: MemberRow[]) {
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}

const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

const MEMBERS = "/dashboard/organization/members";
const INVITES = "/dashboard/organization/invites";
const CLIENTS = "/dashboard/organization/settings";

export function overviewStats(clients: Client[], members: MemberRow[], pendingInvites: number): StatCardItem[] {
  const staff = people(members);
  return [
    { label: "Clients", value: clients.length, icon: Building2Icon, hint: "brand and franchises", href: CLIENTS },
    { label: "Franchises", value: count(clients, (c) => !c.isBrand), icon: StoreIcon, hint: "shops under the brand", href: `${CLIENTS}?type=franchise` },
    { label: "Staff", value: staff.length, icon: UsersIcon, hint: "people with console access", href: MEMBERS },
    { label: "Admins", value: count(staff, (m) => m.role === "admin"), icon: ShieldIcon, hint: "full access", href: `${MEMBERS}?role=admin` },
    { label: "Pending invites", value: pendingInvites, icon: MailIcon, hint: "waiting to be accepted", href: `${INVITES}?status=pending` },
  ];
}

export function memberStats(rows: MemberRow[]): StatCardItem[] {
  const staff = people(rows);
  return [
    { label: "Total", value: staff.length, icon: UsersIcon, hint: "people with console access", href: MEMBERS },
    { label: "Admins", value: count(staff, (m) => m.role === "admin"), icon: ShieldIcon, hint: "full access", href: `${MEMBERS}?role=admin` },
    { label: "Members", value: count(staff, (m) => m.role === "member"), icon: UserIcon, hint: "limited access", href: `${MEMBERS}?role=member` },
    { label: "Active", value: count(staff, (m) => m.status === "active"), icon: UserCheckIcon, hint: "can sign in", href: `${MEMBERS}?status=active` },
    { label: "No password yet", value: count(staff, (m) => !m.passwordSet), icon: KeyRoundIcon, hint: "invited, not set up", href: `${MEMBERS}?password=unset` },
  ];
}

export type InviteBucket = "pending" | "accepted" | "expired" | "canceled";

/** The five invite cards. Expired is a pending invite past its expiry; canceled includes declined. */
export function inviteBucket(r: InviteRow, now: number): InviteBucket {
  if (r.status === "pending" && new Date(r.expiresAt).getTime() < now) return "expired";
  if (r.status === "accepted") return "accepted";
  if (r.status === "canceled" || r.status === "rejected") return "canceled";
  if (r.status === "pending") return "pending";
  const unreachable: never = r.status;
  return unreachable;
}

const inviteHref = (status?: InviteBucket) => (status ? `${INVITES}?status=${status}` : INVITES);

export function inviteStats(rows: InviteRow[], now: number): StatCardItem[] {
  const n = (status: InviteBucket) => count(rows, (r) => inviteBucket(r, now) === status);
  return [
    { label: "Total", value: rows.length, icon: MailIcon, hint: "invites sent", href: inviteHref() },
    { label: "Pending", value: n("pending"), icon: ClockIcon, hint: "waiting to be accepted", href: inviteHref("pending") },
    { label: "Accepted", value: n("accepted"), icon: MailCheckIcon, hint: "joined the team", href: inviteHref("accepted") },
    { label: "Expired", value: n("expired"), icon: UserXIcon, hint: "can be resent", href: inviteHref("expired") },
    { label: "Canceled", value: n("canceled"), icon: MailXIcon, hint: "canceled or declined", href: inviteHref("canceled") },
  ];
}

export function clientStats(clients: Client[]): StatCardItem[] {
  return [
    { label: "Clients", value: clients.length, icon: Building2Icon, hint: "brand and franchises", href: CLIENTS },
    { label: "Brands", value: count(clients, (c) => c.isBrand), icon: CheckCircle2Icon, hint: "top-level clients", href: `${CLIENTS}?type=brand` },
    { label: "Franchises", value: count(clients, (c) => !c.isBrand), icon: StoreIcon, hint: "shops under a brand", href: `${CLIENTS}?type=franchise` },
    { label: "Staff seats", value: clients.reduce((n, c) => n + c.memberCount, 0), icon: UsersIcon, hint: "memberships across clients" },
    { label: "No staff", value: count(clients, (c) => c.memberCount === 0), icon: UserXIcon, hint: "clients nobody runs yet", href: `${CLIENTS}?staff=none` },
  ];
}
