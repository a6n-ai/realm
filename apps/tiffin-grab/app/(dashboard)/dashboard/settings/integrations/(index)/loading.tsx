import { MarketplaceSkeleton } from "../marketplace";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <MarketplaceSkeleton />
    </div>
  );
}
