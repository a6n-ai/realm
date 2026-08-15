import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "..", "..");

const nextConfig: NextConfig = {
  // Docker: emit .next/standalone (self-contained server.js + traced node_modules).
  // outputFileTracingRoot must be the monorepo root or workspace deps get missed.
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@realm/whatsapp", "@realm/sms", "@realm/notifications", "@realm/commons", "@realm/database", "@realm/routes", "@realm/themes", "@realm/ui", "@realm/design-system", "@realm/crm", "@realm/realtime", "@realm/auth-ui", "@realm/clover", "@realm/google-reviews", "@realm/order-tracking"],
  turbopack: { root: monorepoRoot },
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
  // Product photos are rehosted via S3 + CloudFront (FILES_PUBLIC_BASE_URL) — when
  // unset, files fall back to same-origin /api/files, which next/image handles
  // natively without remotePatterns.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.cloudfront.net" },
      // Google review author avatars (authorAttribution.photoUri). Without this
      // next/image refuses the host and every avatar renders as a broken image.
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
    // Next defaults /_next/image responses to Content-Disposition: attachment
    // (XSS defense for unoptimized/passthrough SVG delivery). Safari honours
    // that even for <img> embeds and refuses to render the image inline,
    // showing a broken-image icon — reproduced on real iPhone Safari, not in
    // Chromium-based tooling. Safe to relax here: uploads are restricted to
    // PNG/JPEG/WebP/GIF (no SVG, see app/api/files/upload/validate.ts) and
    // every image is re-encoded through sharp both at upload/sync time and by
    // this optimizer, so there's no raw-passthrough vector to guard against.
    contentDispositionType: "inline",
  },
  experimental: { optimizePackageImports: ["radix-ui", "cmdk"] },
  // /menu and /productsmenu were both live public URLs before the rename to
  // /eats — keep indexed/bookmarked links alive.
  async redirects() {
    return [
      { source: "/menu", destination: "/eats", permanent: true },
      { source: "/productsmenu", destination: "/eats", permanent: true },
      // Delivery settings moved out of Catalogue into Settings.
      {
        source: "/dashboard/catalogue/delivery-types",
        destination: "/dashboard/settings/delivery/options",
        permanent: true,
      },
      {
        source: "/dashboard/catalogue/delivery-zones",
        destination: "/dashboard/settings/delivery/zones",
        permanent: true,
      },
      {
        source: "/dashboard/settings/delivery",
        destination: "/dashboard/settings/delivery/options",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
