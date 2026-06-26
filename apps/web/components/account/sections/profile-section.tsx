import { SectionCard } from "@/components/ds";
import { AvatarField } from "@/components/account/leaves/avatar-field";
import { ProfileForm } from "@/components/account/leaves/profile-form";

export function ProfileSection({
  image,
  name,
  titleAs,
}: {
  image: string | null;
  name: string | null;
  titleAs?: "h2" | "h3";
}) {
  return (
    <section id="profile" className="scroll-mt-24">
      <SectionCard variant="flat" titleAs={titleAs} title="Profile" subtitle="Your photo and display name.">
        <div className="flex flex-col gap-4">
          <AvatarField image={image} name={name} />
          <ProfileForm name={name ?? ""} />
        </div>
      </SectionCard>
    </section>
  );
}
