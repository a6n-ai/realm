"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { apiFetch } from "@/lib/http/api-fetch";

/** Per-row invite for a Clover customer with no app account — emails them a link to order online. */
export function InviteCustomerButton({ publicId, disabled }: { publicId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        await apiFetch(`/api/customers/invite/${encodeURIComponent(publicId)}`, { method: "POST" });
        toast.success("Invite sent");
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
      disabled={disabled || pending}
      onClick={onClick}
    >
      <MailIcon className={pending ? "size-3.5 animate-pulse" : "size-3.5"} />
      Invite to order
    </Button>
  );
}
