import type { SavedAddress } from "@foundry/address";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { DropOffValue } from "@/lib/catalog/drop-off";
import type { WizardSelections } from "@/components/wizard/selections";

export type QuickRenewData = {
  catalog: ClientCatalogSnapshot;
  initial: WizardSelections;
  sourceOrderPublicId: string;
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
