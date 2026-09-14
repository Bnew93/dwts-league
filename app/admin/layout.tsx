import { notFound } from "next/navigation";
import { getUser } from "@/lib/league";
import { UserShell } from "@/components/shell";

/** Platform dashboard: 404 (not 403) for everyone but the platform admin. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await getUser();
  if (!u.isPlatformAdmin) notFound();
  return (
    <UserShell
      u={u}
      wide
      items={[
        { href: "/admin", label: "Dashboard", icon: "admin", exact: true },
        { href: "/admin/ingest", label: "Results & ingest", icon: "draft" },
      ]}
    >
      {children}
    </UserShell>
  );
}
