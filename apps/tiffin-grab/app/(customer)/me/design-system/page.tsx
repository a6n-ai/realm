import { notFound } from "next/navigation";
import { KitGallery } from "./gallery";
import { isProduction } from "@/lib/runtime/env";

export default function DesignSystemPage() {
  if (isProduction()) notFound();
  return <KitGallery />;
}
