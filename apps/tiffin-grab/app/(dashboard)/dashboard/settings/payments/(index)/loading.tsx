import { PaymentsHubSkeleton } from "../payments-hub-skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PaymentsHubSkeleton />
    </div>
  );
}
