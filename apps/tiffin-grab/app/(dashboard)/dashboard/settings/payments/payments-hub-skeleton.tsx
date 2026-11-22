// 2 manual methods (cash, e-transfer) + add row.
import { SettingsColumns, SettingsGroupSkeleton } from "../_components/grouped-list";

export function PaymentsHubSkeleton() {
  return (
    <SettingsColumns>
      <SettingsGroupSkeleton rows={3} />
      <SettingsGroupSkeleton rows={1} />
    </SettingsColumns>
  );
}
