import { redirect } from "next/navigation";
import { Role } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { personalizationService } from "@/lib/services/personalization.service";
import { QuestionScreen } from "@/components/customer/welcome/question-screen";

type SearchParams = Promise<{ edit?: string }>;

export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (session?.user.role !== Role.USER) redirect("/me");

  const sp = await searchParams;
  const edit = sp.edit === "1";

  const question = await personalizationService.nextForCustomer(edit ? { edit: true } : undefined);
  if (!question) redirect(edit ? "/me/account?section=about" : "/me");

  return <QuestionScreen question={question} edit={edit} />;
}
