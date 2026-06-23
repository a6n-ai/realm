"use client";

import type { Country as CountryCode } from "react-phone-number-input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AvatarField } from "./avatar-field";
import { ProfileForm } from "./profile-form";
import { AccountForm } from "./account-form";
import { ResendVerification } from "./resend-verification";
import { ChangePasswordForm } from "./change-password-form";
import { SignOutButton } from "./sign-out-button";
import { PinSection } from "./pin-section";

interface AccountTabsProps {
  image: string | null;
  name: string | null;
  phone: string;
  email: string;
  emailVerified: boolean;
  defaultCountry: CountryCode;
  hasPin: boolean;
}

export function AccountTabs({
  image,
  name,
  phone,
  email,
  emailVerified,
  defaultCountry,
  hasPin,
}: AccountTabsProps) {
  return (
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="contact">Contact</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="mt-4 flex flex-col gap-4">
        <AvatarField image={image} name={name} />
        <ProfileForm name={name ?? ""} />
      </TabsContent>

      <TabsContent value="contact" className="mt-4 flex flex-col gap-4">
        <AccountForm phone={phone} email={email} defaultCountry={defaultCountry} />
        {email && (
          <div className="flex flex-col gap-2 max-w-md">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">Email status:</span>
              {emailVerified ? (
                <Badge variant="secondary">Verified</Badge>
              ) : (
                <Badge variant="outline">Unverified</Badge>
              )}
            </div>
            {!emailVerified && <ResendVerification email={email} />}
          </div>
        )}
      </TabsContent>

      <TabsContent value="security" className="mt-4 flex flex-col gap-6">
        <ChangePasswordForm />
        <PinSection hasPin={hasPin} />
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">Sign out of your account on this device.</p>
          <SignOutButton />
        </div>
      </TabsContent>
    </Tabs>
  );
}
