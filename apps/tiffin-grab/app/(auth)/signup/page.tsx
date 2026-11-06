import { permanentRedirect } from "next/navigation";

// Accounts are created on /subscribe's email step (email + 6-digit code, then the plan builder).
// The old phone + password form here was a slower second path; old links and bookmarks land there.
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  permanentRedirect(ref ? `/subscribe?ref=${encodeURIComponent(ref)}` : "/subscribe");
}
