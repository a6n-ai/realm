import { Suspense } from "react";
import { requireAccountUser } from "@/app/(dashboard)/dashboard/account/current-user";
import { ProfileSection } from "@/components/account/sections/profile-section";

export default function MeProfilePage() {
  return (
    <Suspense fallback={<ProfileSection.Skeleton />}>
      <ProfileData />
    </Suspense>
  );
}

async function ProfileData() {
  const { user } = await requireAccountUser();
  return (
    <ProfileSection
      image={user.image ?? null}
      name={user.name ?? null}
      username={user.displayUsername ?? user.username ?? null}
    />
  );
}
