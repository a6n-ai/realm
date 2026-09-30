import { redirect } from "next/navigation";

/** Trials are chosen inside the subscribe wizard (Bundle step). */
export default function TrialPage() {
  redirect("/me/renew");
}
