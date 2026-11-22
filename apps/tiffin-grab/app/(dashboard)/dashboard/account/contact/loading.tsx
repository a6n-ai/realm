import { ContactSection } from "@/components/account/sections/contact-section";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <ContactSection.Skeleton />
    </div>
  );
}
