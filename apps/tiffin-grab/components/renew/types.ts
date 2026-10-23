import type { SavedAddress } from "@foundry/address";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { DropOffValue } from "@/lib/catalog/drop-off";
import type { WizardSelections } from "@/components/wizard/selections";

export type QuickRenewData = {
  catalog: ClientCatalogSnapshot;
  initial: WizardSelections;
  sourceOrderPublicId: string;
  /** The source order's org: the preview prices from its catalog, same as createOrder. */
  organizationId: string | null;
  /** The rail checkout and the staff action charge on, so the quote carries its per-method taxes. */
  defaultPaymentMethodId: string | null;
  minStartDate: string | null;
  lastTiffin: string | null;
  holidayDates: string[];
  savedAddresses: SavedAddress[];
  addressDropOffs: Record<string, DropOffValue>;
  defaultAddressPublicId: string | null;
  /** The source plan's admin tag, same source as the deliveries plan header. */
  tagColor: string | null;
  tagLabel: string | null;
};
