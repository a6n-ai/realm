import { Suspense } from "react";
import { ProfileSection } from "@/components/account/sections/profile-section";
import { requireAccountUser } from "../current-user";

export default function AccountProfilePage() {
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
