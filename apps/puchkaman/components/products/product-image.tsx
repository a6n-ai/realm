import type { FileDetail } from "@realm/storage/model";
import { Ph } from "@/components/brutal/shared";

// Real photo when the admin has uploaded one; otherwise the same striped
// placeholder tile the static menu used to show for every item.
export function ProductImage({ image, name }: { image: FileDetail | null; name: string }) {
  if (image?.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={image.url}
        alt={name}
        loading="lazy"
        style={{
          aspectRatio: "4 / 3",
          width: "100%",
          objectFit: "cover",
          border: "none",
          borderBottom: "var(--border)",
          borderRadius: 0,
        }}
      />
    );
  }
  return <Ph label="photo" ratio="4 / 3" style={{ border: "none", borderBottom: "var(--border)", borderRadius: 0, minHeight: 0 }} />;
}
