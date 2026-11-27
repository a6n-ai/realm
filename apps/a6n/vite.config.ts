import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Console is a linked source package: optimizing its subpaths separately duplicates the router context.
  optimizeDeps: { exclude: ["@foundry/console"] },
  plugins: [tailwindcss(), cloudflare({ viteEnvironment: { name: "ssr" } }), tanstackStart(), react()],
});
