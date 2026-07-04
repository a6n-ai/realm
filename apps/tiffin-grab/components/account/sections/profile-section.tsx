import { SectionCard } from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";
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

ProfileSection.Skeleton = function ProfileSectionSkeleton({ titleAs }: { titleAs?: "h2" | "h3" }) {
  return (
    <section id="profile" className="scroll-mt-24">
      <SectionCard variant="flat" titleAs={titleAs} title="Profile" subtitle="Your photo and display name.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-start gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
          <div className="grid max-w-md gap-3">
            <div className="grid gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </SectionCard>
    </section>
  );
};
