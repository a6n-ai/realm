import { toast } from "sonner";

/** Whatever shape a sync/push result uses for its per-entity failures. */
export type SyncErrorLike = {
  entity?: string;
  item?: string;
  publicId?: string;
  message: string;
};

/**
 * Diagnostics wait for the reader. An API message like "Developer App Id is
 * required for get menus from provider" is the whole point of the toast, and
 * any timeout races whoever is looking at the sync counts instead — so it stays
 * until dismissed, with a close button since the Toaster has none by default.
 */
const ERROR_TOAST_OPTIONS = { duration: Infinity, closeButton: true } as const;

/**
 * Show what the upstream API actually said.
 *
 * Syncs catch per-entity failures so one bad row cannot abort the whole pull,
 * which is right — but reporting only a count ("2 sync warning(s)") throws away
 * the diagnosis at the last step. A Clover 400 explaining that a merchant API
 * token cannot read menus then looks identical to an empty result, and the only
 * way to read it is querying the audit log.
 *
 * Shows the first message in full, with the remainder as a count so a hundred
 * failures cannot bury the screen.
 */
export function toastSyncErrors(errors: SyncErrorLike[] | undefined, prefix?: string): void {
  if (!errors?.length) return;
  const first = errors[0]!;
  const subject = first.entity ?? first.item ?? first.publicId;
  const headline = [prefix, subject, first.message].filter(Boolean).join(": ");
  toast.warning(headline, {
    ...ERROR_TOAST_OPTIONS,
    ...(errors.length > 1 ? { description: `+${errors.length - 1} more` } : {}),
  });
}
