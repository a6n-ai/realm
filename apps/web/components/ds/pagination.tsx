import { Button } from "@/components/ui/button";

export function pageRange(page: number, pageCount: number): number[] {
  if (pageCount <= 3) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const start = Math.min(Math.max(1, page - 1), pageCount - 2);
  return [start, start + 1, start + 2];
}

export function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</Button>
      {pageRange(page, pageCount).map((p) => (
        <Button key={p} variant={p === page ? "default" : "outline"} size="sm" onClick={() => onPage(p)}>{p}</Button>
      ))}
      <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}
