"use server";

import { headers } from "next/headers";
import { listFranchiseLocations, type FranchiseLocation } from "@/lib/services/organizations.service";

// Trust ONLY x-real-ip, same as auth/index.ts's rate-limit key — Caddy
// overwrites this with the real socket peer; x-forwarded-for is spoofable.
async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-real-ip");
}

type IpApiResponse = { status: "success" | "fail"; city?: string };

// ip-api.com free tier: no key, HTTP only (fine — server-to-server, not the
// browser), 45 req/min. Best-effort: any failure just means no suggestion,
// the location picker still works via manual search/pick.
async function lookupCity(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city`, { signal: AbortSignal.timeout(2000) });
    const data = (await res.json()) as IpApiResponse;
    return data.status === "success" ? (data.city ?? null) : null;
  } catch {
    return null;
  }
}

export async function detectFranchiseByIp(): Promise<FranchiseLocation | null> {
  const ip = await clientIp();
  if (!ip) return null;
  const [city, locations] = await Promise.all([lookupCity(ip), listFranchiseLocations()]);
  if (!city) return null;
  return locations.find((l) => l.city?.toLowerCase() === city.toLowerCase()) ?? null;
}

// Thin server-action wrapper so the client-side location picker can fetch the
// list without a route handler — listFranchiseLocations itself is plain
// server-only code, not directly callable from a client component.
export async function listLocationsAction(): Promise<FranchiseLocation[]> {
  return listFranchiseLocations();
}
