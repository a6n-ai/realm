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

export function overviewStats(clients: Client[], members: MemberRow[], pendingInvites: number): StatCardItem[] {
  const staff = people(members);
  return [
    { label: "Clients", value: clients.length, icon: Building2Icon, hint: "brand and franchises" },
    { label: "Franchises", value: count(clients, (c) => !c.isBrand), icon: StoreIcon, hint: "shops under the brand" },
    { label: "Staff", value: staff.length, icon: UsersIcon, hint: "people with console access" },
    { label: "Admins", value: count(staff, (m) => m.role === "admin"), icon: ShieldIcon, hint: "full access" },
    { label: "Pending invites", value: pendingInvites, icon: MailIcon, hint: "waiting to be accepted" },
  ];
}

export function memberStats(rows: MemberRow[]): StatCardItem[] {
  const staff = people(rows);
  return [
    { label: "Total", value: staff.length, icon: UsersIcon, hint: "people with console access" },
    { label: "Admins", value: count(staff, (m) => m.role === "admin"), icon: ShieldIcon, hint: "full access" },
    { label: "Members", value: count(staff, (m) => m.role === "member"), icon: UserIcon, hint: "limited access" },
    { label: "Active", value: count(staff, (m) => m.status === "active"), icon: UserCheckIcon, hint: "can sign in" },
    { label: "No password yet", value: count(staff, (m) => !m.passwordSet), icon: KeyRoundIcon, hint: "invited, not set up" },
  ];
}

export function inviteStats(rows: InviteRow[], now: number): StatCardItem[] {
  const expired = (r: InviteRow) => r.status === "pending" && new Date(r.expiresAt).getTime() < now;
  return [
    { label: "Total", value: rows.length, icon: MailIcon, hint: "invites sent" },
    { label: "Pending", value: count(rows, (r) => r.status === "pending" && !expired(r)), icon: ClockIcon, hint: "waiting to be accepted" },
    { label: "Accepted", value: count(rows, (r) => r.status === "accepted"), icon: MailCheckIcon, hint: "joined the team" },
    { label: "Expired", value: count(rows, expired), icon: UserXIcon, hint: "can be resent" },
    { label: "Canceled", value: count(rows, (r) => r.status === "canceled" || r.status === "rejected"), icon: MailXIcon, hint: "canceled or declined" },
  ];
}

export function clientStats(clients: Client[]): StatCardItem[] {
  return [
    { label: "Clients", value: clients.length, icon: Building2Icon, hint: "brand and franchises" },
    { label: "Brands", value: count(clients, (c) => c.isBrand), icon: CheckCircle2Icon, hint: "top-level clients" },
    { label: "Franchises", value: count(clients, (c) => !c.isBrand), icon: StoreIcon, hint: "shops under a brand" },
    { label: "Staff seats", value: clients.reduce((n, c) => n + c.memberCount, 0), icon: UsersIcon, hint: "memberships across clients" },
    { label: "No staff", value: count(clients, (c) => c.memberCount === 0), icon: UserXIcon, hint: "clients nobody runs yet" },
  ];
}
