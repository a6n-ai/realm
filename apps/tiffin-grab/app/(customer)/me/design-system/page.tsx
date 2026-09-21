import { notFound } from "next/navigation";
import { KitGallery } from "./gallery";

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitGallery />;
}
