"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CloudUploadIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@realm/ui/select";
import { Switch } from "@realm/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@realm/ui/table";
import { SyncLoadingOverlay } from "@/components/admin/sync-loading-overlay";
import { apiFetch } from "@/lib/http/api-fetch";
import type {
  MenuCategoryOption,
  MenuDetail as MenuDetailData,
  MenuSaveResult,
} from "@/lib/services/inventory.service";

type DraftSection = {
  key: string;
  categoryPublicId: string;
  categoryName: string;
  categoryActive: boolean;
  categoryColorCode: string | null;
  cloverCategoryId: string | null;
  sortOrder: number;
  items: MenuDetailData["sections"][number]["items"];
};

function toDraftSections(menu: MenuDetailData): DraftSection[] {
  return menu.sections.map((s, i) => ({
    key: s.publicId || `${s.categoryPublicId}-${i}`,
    categoryPublicId: s.categoryPublicId,
    categoryName: s.categoryName,
    categoryActive: s.categoryActive,
    categoryColorCode: s.categoryColorCode,
    cloverCategoryId: s.cloverCategoryId,
    sortOrder: s.sortOrder,
    items: s.items,
  }));
}

function reindex(sections: DraftSection[]): DraftSection[] {
  return sections.map((s, i) => ({ ...s, sortOrder: i }));
}

export function MenuDetail({
  menu,
  categories,
  cloverConnected,
}: {
  menu: MenuDetailData;
  categories: MenuCategoryOption[];
  cloverConnected: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(menu.name);
  const [active, setActive] = useState(menu.active);
  const [sortOrder, setSortOrder] = useState(menu.sortOrder);
  const [sections, setSections] = useState(() => toDraftSections(menu));
  const [addCategoryId, setAddCategoryId] = useState<string>("");
  const [saving, setSaving] = useState<"local" | "push" | null>(null);

  useEffect(() => {
    setName(menu.name);
    setActive(menu.active);
    setSortOrder(menu.sortOrder);
    setSections(toDraftSections(menu));
  }, [menu]);

  const usedCategoryIds = new Set(sections.map((s) => s.categoryPublicId));
  const availableToAdd = categories.filter((c) => !usedCategoryIds.has(c.publicId));

  function moveSection(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= sections.length) return;
    const copy = [...sections];
    const a = copy[index]!;
    const b = copy[next]!;
    copy[index] = b;
    copy[next] = a;
    setSections(reindex(copy));
  }

  function removeSection(index: number) {
    setSections(reindex(sections.filter((_, i) => i !== index)));
  }

  function addSection() {
    if (!addCategoryId) return;
    const cat = categories.find((c) => c.publicId === addCategoryId);
    if (!cat) return;
    setSections(
      reindex([
        ...sections,
        {
          key: `new-${cat.publicId}-${Date.now()}`,
          categoryPublicId: cat.publicId,
          categoryName: cat.name,
          categoryActive: cat.active,
          categoryColorCode: cat.colorCode,
          cloverCategoryId: null,
          sortOrder: sections.length,
          items: [],
        },
      ]),
    );
    setAddCategoryId("");
  }

  async function save(pushToClover: boolean) {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (pushToClover && !cloverConnected) {
      toast.error("Connect Clover under Settings → Clover first.");
      return;
    }
    setSaving(pushToClover ? "push" : "local");
    try {
      await apiFetch<MenuSaveResult>(`/api/inventory/menus/${menu.publicId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          active,
          sortOrder,
          pushToClover,
          sections: sections.map((s) => ({
            categoryPublicId: s.categoryPublicId,
            sortOrder: s.sortOrder,
          })),
        }),
      });
      toast.success(pushToClover ? "Saved and pushed category order to Clover" : "Menu saved");
      router.refresh();
    } catch {
      // apiFetch already toasted.
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <SyncLoadingOverlay
        open={saving !== null}
        label={saving === "push" ? "Saving and pushing to Clover…" : "Saving menu…"}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/clover/menus">
            <ArrowLeftIcon />
            Back
          </Link>
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!!saving}
          onClick={() => void save(false)}
        >
          {saving === "local" ? <Loader2Icon className="animate-spin" /> : null}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!!saving || !cloverConnected}
          onClick={() => void save(true)}
        >
          {saving === "push" ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <CloudUploadIcon />
          )}
          Save & push to Clover
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Menu">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="menu-name">Name</Label>
              <Input
                id="menu-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="menu-sort">Sort order</Label>
              <Input
                id="menu-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="menu-active">Active</Label>
                <p className="text-muted-foreground text-xs">Inactive menus stay listed but marked off.</p>
              </div>
              <Switch id="menu-active" checked={active} onCheckedChange={setActive} />
            </div>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Public id</dt>
                <dd className="font-mono text-xs">{menu.publicId}</dd>
              </div>
              {menu.cloverMenuId ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Clover menu</dt>
                  <dd className="font-mono text-xs">{menu.cloverMenuId}</dd>
                </div>
              ) : (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Clover menu</dt>
                  <dd className="text-muted-foreground text-xs">
                    Local Register layout (no Clover Menus API)
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </SectionCard>

        <SectionCard title="Add section">
          <p className="text-muted-foreground mb-3 text-sm">
            Sections are Clover categories. Reorder them below; Save & push updates category sort
            order on Clover Register.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-2">
              <Label>Category</Label>
              <Select
                value={addCategoryId || undefined}
                onValueChange={setAddCategoryId}
                disabled={availableToAdd.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      availableToAdd.length === 0
                        ? "All categories already on this menu"
                        : "Choose category…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((c) => (
                    <SelectItem key={c.publicId} value={c.publicId}>
                      {c.name}
                      {!c.active ? " (inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!addCategoryId}
              onClick={addSection}
            >
              <PlusIcon />
              Add
            </Button>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Sections">
        {sections.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No sections. Add a category or Sync from Clover on the menus list.
          </p>
        ) : (
          <div className="space-y-6">
            {sections.map((s, index) => (
              <div key={s.key} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.categoryName}</span>
                  <Badge variant={s.categoryActive ? "default" : "outline"}>
                    {s.categoryActive ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-muted-foreground text-xs">Order {s.sortOrder}</span>
                  {s.cloverCategoryId ? (
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {s.cloverCategoryId}
                    </span>
                  ) : null}
                  <div className="ml-auto flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === 0}
                      onClick={() => moveSection(index, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === sections.length - 1}
                      onClick={() => moveSection(index, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeSection(index)}
                      aria-label="Remove section"
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
                {s.items.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No linked products in this category yet (sync catalog after products).
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Clover item</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.items.map((item) => (
                        <TableRow key={item.productPublicId}>
                          <TableCell>
                            <Link
                              href={`/dashboard/products/${item.productPublicId}`}
                              className="hover:underline"
                            >
                              {item.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.active ? "default" : "outline"}>
                              {item.active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {item.cloverItemId ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}
