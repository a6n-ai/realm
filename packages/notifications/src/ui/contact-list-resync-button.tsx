"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCwIcon } from "lucide-react";
import { apiFetch } from "./api-fetch";
import { Button } from "@realm/ui/button";

export function ContactListResyncButton({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resync() {
    setBusy(true);
    try {
      const res = await apiFetch<{ imported: number }>(`/api/notifications/contact-lists/${publicId}/resync`, {
        method: "POST",
      });
      toast.success(res.imported > 0 ? `Added ${res.imported} new customers` : "No new customers to add");
      router.refresh();
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={resync} disabled={busy}>
      <RefreshCwIcon className={busy ? "size-3.5 animate-spin" : "size-3.5"} />
      Resync
    </Button>
  );
}
