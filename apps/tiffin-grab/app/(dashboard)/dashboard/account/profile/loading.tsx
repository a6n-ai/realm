import { ProfileSection } from "@/components/account/sections/profile-section";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <ProfileSection.Skeleton />
    </div>
  );
}
