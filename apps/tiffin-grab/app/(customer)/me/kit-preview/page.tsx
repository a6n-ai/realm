import { notFound } from "next/navigation";
import { KitGallery } from "./gallery";

export default function KitPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitGallery />;
}
