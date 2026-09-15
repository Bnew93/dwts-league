import { getUser } from "@/lib/league";
import { UserNav } from "@/components/shell";

export default async function LeaguesLayout({ children }: { children: React.ReactNode }) {
  const u = await getUser();
  return (
    <>
      <UserNav u={u} />
      {children}
    </>
  );
}
