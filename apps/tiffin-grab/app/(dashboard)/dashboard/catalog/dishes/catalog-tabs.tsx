"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@realm/ui/tabs";

// Thin client shell around two server-loaded <ResourceEditor> trees (passed as
// children props, not rendered here) — keeps CatalogData/ResourceEditor
// untouched and un-duplicated.
export function CatalogTabs({ dishes, categories }: { dishes: ReactNode; categories: ReactNode }) {
  return (
    <Tabs defaultValue="dishes">
      <TabsList>
        <TabsTrigger value="dishes">Dishes</TabsTrigger>
        <TabsTrigger value="categories">Categories</TabsTrigger>
      </TabsList>
      <TabsContent value="dishes">{dishes}</TabsContent>
      <TabsContent value="categories">{categories}</TabsContent>
    </Tabs>
  );
}
