import type { Metadata } from "next";
import { CopyCode } from "./copy-code";

export const metadata: Metadata = { title: "Your code", referrer: "no-referrer", robots: { index: false } };

export default function CodePage() {
  return <CopyCode />;
}
