import { DeliveriesHub, type HubSearchParams } from "./deliveries/hub";

export default function MePage({ searchParams }: { searchParams: HubSearchParams }) {
  return <DeliveriesHub searchParams={searchParams} />;
}
