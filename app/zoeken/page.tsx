import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/session";
import { LiteratureSearch } from "@/components/search/LiteratureSearch";

export default async function ZoekenPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  return <LiteratureSearch />;
}
