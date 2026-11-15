"use client";

import {
  BadgeCheck,
  Circle,
  CircleX,
  CreditCard,
  Download,
  Eye,
  FolderOpen,
  Gift,
  LogOut,
  Pause,
  Pencil,
  Plus,
  Send,
  Settings2,
  Trash2,
  Undo2,
  Upload,
  UserMinus,
  UserPlus,
  UserX,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  Eye, Pencil, Plus, Trash2, CircleX, Settings2, Send, Undo2, CreditCard, BadgeCheck, Download, Upload,
  Gift, Pause, UserPlus, UserX, UserMinus, FolderOpen, LogOut, Circle,
} satisfies Record<string, LucideIcon>;

export type ActionIconName = keyof typeof ICONS;

// Names, not components: server code imports this map and passes only the action string.
export const ACTION_ICONS: Record<string, ActionIconName> = {
  read: "Eye",
  write: "Pencil",
  update: "Pencil",
  create: "Plus",
  delete: "Trash2",
  cancel: "CircleX",
  manage: "Settings2",
  publish: "Send",
  send: "Send",
  refund: "Undo2",
  charge: "CreditCard",
  verify: "BadgeCheck",
  export: "Download",
  import: "Upload",
  give: "Gift",
  pause: "Pause",
  invite: "UserPlus",
  suspend: "UserX",
  remove: "UserMinus",
  bulkAccess: "FolderOpen",
  leave: "LogOut",
};

export function ActionIcon({ action }: { action: string }) {
  const Icon = ICONS[ACTION_ICONS[action] ?? "Circle"];
  return <Icon className="size-4 text-muted-foreground" aria-hidden />;
}
