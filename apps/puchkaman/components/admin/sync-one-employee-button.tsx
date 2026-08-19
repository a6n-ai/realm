"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { apiFetch } from "@/lib/http/api-fetch";

/** Per-row Clover pull for one employee — table's row-level counterpart to CloverEmployeesSyncActions. */
export function SyncOneEmployeeButton({
  publicId,
  disabled,
}: {
  publicId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        await apiFetch(`/api/employees/${encodeURIComponent(publicId)}/sync`, { method: "POST" });
        toast.success("Employee synced from Clover");
        router.refresh();
      } catch {
        // apiFetch already toasts
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2"
      aria-label="Sync this employee from Clover"
      disabled={disabled || pending}
      onClick={onClick}
    >
      <RefreshCwIcon className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
    </Button>
  );
}
