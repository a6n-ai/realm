import { redirect } from "next/navigation";

/** Payments merged into the Orders tab ("Orders & payments"); old links keep working. */
export default async function CustomerPaymentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] != null)).toString();
  redirect(`/dashboard/customers/${id}/orders${qs ? `?${qs}` : ""}`);
}
