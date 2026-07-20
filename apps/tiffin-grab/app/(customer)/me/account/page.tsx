import { redirect } from "next/navigation";
import { NotFoundError } from "@realm/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";
import { CustomerAccountHub } from "@/components/customer/account/customer-account-hub";

export default async function MeAccountPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  let user;
  try {
    user = await usersService.read(session.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/login");
    throw err;
  }

  return (
    <main className="md:px-0">
      <CustomerAccountHub
        user={{
          name: user.name ?? null,
          email: user.email ?? session.user.email ?? "",
          phone: user.phone ?? null,
          image: user.image ?? null,
        }}
      />
    </main>
  );
}
