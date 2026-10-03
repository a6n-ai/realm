"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";

// Thin client shell around server-loaded <ResourceEditor> trees (passed as
// children props, not rendered here) — keeps CatalogData/ResourceEditor
// untouched and un-duplicated.
export function CatalogTabs({ dishes, addons, categories }: { dishes: ReactNode; addons: ReactNode; categories: ReactNode }) {
  return (
    <Tabs defaultValue="dishes">
      <TabsList variant="line">
        <TabsTrigger value="dishes">Dishes</TabsTrigger>
        <TabsTrigger value="addons">Add-ons</TabsTrigger>
        <TabsTrigger value="categories">Categories</TabsTrigger>
      </TabsList>
      <TabsContent value="dishes">{dishes}</TabsContent>
      <TabsContent value="addons">{addons}</TabsContent>
      <TabsContent value="categories">{categories}</TabsContent>
    </Tabs>
  );
}
