import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Same auth URLs as the other apps (/login, /signup, ...). Customers here sign
 * in and sign up with one emailed-code flow on /account.
 */
export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).callbackUrl;
  redirect(typeof raw === "string" ? `/account?callbackUrl=${encodeURIComponent(raw)}` : "/account");
}
