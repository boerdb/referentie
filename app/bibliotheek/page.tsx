import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/session";
import { LibraryApp } from "@/components/library/LibraryApp";

export default async function BibliotheekPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  return <LibraryApp user={session} />;
}
