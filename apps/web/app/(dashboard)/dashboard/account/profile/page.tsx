import { ProfileSection } from "@/components/account/sections/profile-section";
import { requireAccountUser } from "../current-user";

export default async function AccountProfilePage() {
  const { user } = await requireAccountUser();
  return <ProfileSection image={user.image ?? null} name={user.name ?? null} />;
}
