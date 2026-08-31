import Image from "next/image";
import type { FileDetail } from "@foundry/storage/model";
import { Ph } from "@/components/brutal/shared";

// Real photo when the admin has uploaded one; otherwise the same striped
// placeholder tile the static menu used to show for every item.
export function ProductImage({ image, name }: { image: FileDetail | null; name: string }) {
  if (image?.url) {
    return (
      <div style={{ position: "relative", aspectRatio: "4 / 3", width: "100%" }}>
        <Image
          src={image.url}
          alt={name}
          fill
          sizes="(min-width: 1024px) 280px, (min-width: 640px) 40vw, 90vw"
          style={{ objectFit: "cover", borderBottom: "var(--border)" }}
        />
      </div>
    );
  }
  return <Ph label="photo" ratio="4 / 3" style={{ border: "none", borderBottom: "var(--border)", borderRadius: 0, minHeight: 0 }} />;
}
