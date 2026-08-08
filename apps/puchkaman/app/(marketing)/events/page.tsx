// Watch parties aren't an actual offering — hidden (404) rather than deleted,
// in case this gets repurposed later. EventsView/its copy is untouched.
import { notFound } from "next/navigation";

export default function EventsPage() {
  notFound();
}
