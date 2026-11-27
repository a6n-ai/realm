import { ConfirmDialog } from "@foundry/console/confirm-dialog";
import { confirmAction } from "@foundry/console/run-action";
import { useRouter } from "@tanstack/react-router";
import { errorText } from "../../lib/error-copy";
import { removeFn } from "../../lib/team/team.fns";

export function RemoveMemberDialog({
  member,
  onClose,
}: {
  member: { id: string; name: string; email: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      open={member !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Remove ${member?.name ?? "member"}?`}
      description={`${member?.email ?? ""} loses access now. Their open inquiries become unassigned.`}
      confirmLabel="Remove member"
      onConfirm={() => confirmAction(() => removeFn({ data: { id: member!.id } }), "Member removed", () => router.invalidate(), errorText)}
    />
  );
}
