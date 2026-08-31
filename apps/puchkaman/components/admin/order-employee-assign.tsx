"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foundry/ui/select";
import { apiFetch } from "@/lib/http/api-fetch";

const UNASSIGNED = "__none__";

type EmployeeOption = {
  publicId: string;
  name: string;
  role: string | null;
};

type AssignResult = {
  orderPublicId: string;
  assignedEmployee: { publicId: string; name: string; cloverEmployeeId: string } | null;
  syncedToClover: boolean;
};

export function OrderEmployeeAssign({
  orderPublicId,
  employees,
  currentEmployeePublicId,
  hasCloverOrder,
}: {
  orderPublicId: string;
  employees: EmployeeOption[];
  currentEmployeePublicId: string | null;
  hasCloverOrder: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const value = currentEmployeePublicId ?? UNASSIGNED;

  function onChange(next: string) {
    const employeePublicId = next === UNASSIGNED ? null : next;
    setBusy(true);
    startTransition(async () => {
      try {
        const res = await apiFetch<AssignResult>(
          `/api/orders/${encodeURIComponent(orderPublicId)}/assign-employee`,
          {
            method: "POST",
            body: JSON.stringify({ employeePublicId }),
          },
        );
        if (res.assignedEmployee) {
          toast.success(
            res.syncedToClover
              ? `Assigned to ${res.assignedEmployee.name} on Clover`
              : `Assigned to ${res.assignedEmployee.name} (local only${hasCloverOrder ? " — Clover sync skipped" : ""})`,
          );
        } else {
          toast.success(res.syncedToClover ? "Employee cleared on Clover" : "Employee cleared");
        }
        router.refresh();
      } catch {
        // apiFetch already toasts
      } finally {
        setBusy(false);
      }
    });
  }

  if (employees.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No employees synced. Sync under Clover → Employees.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={value}
        onValueChange={onChange}
        disabled={busy || pending}
      >
        <SelectTrigger size="sm" className="min-w-[12rem]">
          <SelectValue placeholder="Assign employee" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          {employees.map((e) => (
            <SelectItem key={e.publicId} value={e.publicId}>
              {e.name}
              {e.role ? ` (${e.role})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {busy || pending ? <Loader2Icon className="text-muted-foreground size-4 animate-spin" /> : null}
    </div>
  );
}
