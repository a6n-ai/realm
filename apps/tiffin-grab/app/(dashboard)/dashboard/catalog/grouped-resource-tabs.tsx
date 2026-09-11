"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";

// Same thin client shell as dishes/catalog-tabs.tsx, generalized to an
// arbitrary tab count — used for groupings that need 3+ tabs (delivery
// settings) rather than duplicating a fixed-props version per grouping.
export function GroupedResourceTabs({ tabs }: { tabs: { value: string; label: string; content: ReactNode }[] }) {
  return (
    <Tabs defaultValue={tabs[0]?.value}>
      <TabsList variant="line">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value}>{t.content}</TabsContent>
      ))}
    </Tabs>
  );
}
