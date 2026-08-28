"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Input } from "@realm/ui/input";
import { Badge } from "@realm/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@realm/ui/table";
import type { OrganizationListRow } from "@/lib/services/organizations.service";
import { CreateFranchiseButton } from "./create-franchise-button";

// Same table/search shell as the Users list, scaled to what this data actually
// needs: a couple dozen orgs at most, so no server pagination — a client-side
// filter over the already-fetched rows is plenty.
export function ClientsTable({ orgs }: { orgs: OrganizationListRow[] }) {
  const [query, setQuery] = useState("");

  const brands = orgs.filter((o) => !o.parentOrganizationId);
  const franchisesByBrand = new Map<string, OrganizationListRow[]>();
  for (const o of orgs) {
    if (!o.parentOrganizationId) continue;
    const list = franchisesByBrand.get(o.parentOrganizationId) ?? [];
    list.push(o);
    franchisesByBrand.set(o.parentOrganizationId, list);
  }

  const q = query.trim().toLowerCase();
  const matches = (o: OrganizationListRow) => !q || o.name.toLowerCase().includes(q) || o.clientCode.toLowerCase().includes(q);

  const rows = useMemo(() => {
    const out: { org: OrganizationListRow; isBrand: boolean }[] = [];
    for (const brand of brands) {
      const franchises = franchisesByBrand.get(brand.id) ?? [];
      const brandMatches = matches(brand);
      const visibleFranchises = franchises.filter(matches);
      if (brandMatches || visibleFranchises.length > 0) {
        out.push({ org: brand, isBrand: true });
        for (const f of brandMatches ? franchises : visibleFranchises) out.push({ org: f, isBrand: false });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orgs is a stable prop for the page's lifetime
  }, [orgs, q]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search name or code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Members</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-center">
                  No clients match &quot;{query}&quot;.
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ org, isBrand }) => (
                <TableRow key={org.id}>
                  <TableCell className={isBrand ? "font-medium" : "pl-8"}>
                    <Link href={`/dashboard/organization/clients/${org.id}`} className="hover:underline">
                      {org.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{org.clientCode}</TableCell>
                  <TableCell>
                    <Badge variant={isBrand ? "default" : "secondary"}>{isBrand ? "Brand" : "Franchise"}</Badge>
                  </TableCell>
                  <TableCell>{org.memberCount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap gap-2">
        {brands.map((brand) => (
          <CreateFranchiseButton key={brand.id} brandOrganizationId={brand.id} />
        ))}
      </div>
    </div>
  );
}
