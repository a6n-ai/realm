import type { ReactNode } from "react";
import { MotionProvider } from "@/components/motion/motion-provider";

// Subscribe and checkout animate with motion; the landing and marketing pages don't, so
// the provider lives here and in the app areas rather than in the root layout.
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <MotionProvider>{children}</MotionProvider>;
}
