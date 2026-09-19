export function ClassPhotoStrip({
  urls,
  title,
}: {
  urls: string[];
  title: string;
}) {
  if (urls.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {urls.slice(0, 4).map((url, index) => (
        <li key={url} className="size-12 overflow-hidden border border-[var(--rule)] lg:size-14">
          {/* Uploaded class photos; not the static marketing set. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={index === 0 ? title : ""} className="size-full object-cover" />
        </li>
      ))}
    </ul>
  );
}
