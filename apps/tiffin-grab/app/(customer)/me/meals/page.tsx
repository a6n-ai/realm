import { permanentRedirect } from "next/navigation";

// Dish picking lives in the deliveries hub's Pick meals sheet; keep old links and emails alive.
export default async function LegacyMealsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  permanentRedirect(date ? `/me?action=pick&trip=${encodeURIComponent(date)}` : "/me?action=pick");
}
