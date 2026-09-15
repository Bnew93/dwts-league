import { getUser } from "@/lib/league";
import { UserNav } from "@/components/shell";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const u = await getUser();
  return (
    <>
      <UserNav u={u} />
      {children}
    </>
  );
}
