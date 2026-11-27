import { createRouter, ErrorComponent } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultErrorComponent: ErrorComponent,
    defaultPendingMs: 300,
    defaultPendingMinMs: 400,
  });
}
