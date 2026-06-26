"use client";

import { SectionCard } from "@/components/ds";
import { AvatarField } from "@/components/account/leaves/avatar-field";
import { ProfileForm } from "@/components/account/leaves/profile-form";

export function ProfileSection({
  image,
  name,
}: {
  image: string | null;
  name: string | null;
}) {
  return (
    <section id="profile" className="scroll-mt-24">
      <SectionCard title="Profile" subtitle="Your photo and display name.">
        <div className="flex flex-col gap-4">
          <AvatarField image={image} name={name} />
          <ProfileForm name={name ?? ""} />
        </div>
      </SectionCard>
    </section>
  );
}
