"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { apiFetch } from "@/lib/http/api-fetch";

/** Per-row push of one app customer to Clover as a customer. */
export function SyncCustomerToCloverButton({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        await apiFetch(`/api/customers/${encodeURIComponent(publicId)}/sync-clover`, {
          method: "POST",
        });
        toast.success("Customer pushed to Clover");
        router.refresh();
      } catch {
        // apiFetch already toasts
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2"
      disabled={pending}
      onClick={onClick}
    >
      <UploadIcon className={pending ? "size-3.5 animate-pulse" : "size-3.5"} />
      Sync to Clover
    </Button>
  );
}
