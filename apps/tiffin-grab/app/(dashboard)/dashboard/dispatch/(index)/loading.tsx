import { DispatchChrome, DispatchSkeleton } from "../dispatch-chrome";

export default function Loading() {
  return (
    <DispatchChrome>
      <DispatchSkeleton />
    </DispatchChrome>
  );
}
