import { SuppressedTableSkeleton } from "../logs/suppressed-table";
import { UnsubscribedChrome } from "./unsubscribed-chrome";

export default function Loading() {
  return <UnsubscribedChrome list={<SuppressedTableSkeleton />} />;
}
