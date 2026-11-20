"use client";

import { useParams } from "next/navigation";
import { CatalogResourceChrome } from "../catalog-resource-chrome";
import { ResourceEditorSkeleton } from "./resource-editor";

// loading.tsx gets no params prop, so the client reads the segment to paint the real title.
export default function Loading() {
  const { resource } = useParams<{ resource: string }>();
  return <CatalogResourceChrome resource={resource} list={<ResourceEditorSkeleton resource={resource} />} />;
}
