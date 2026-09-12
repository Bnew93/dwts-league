import type { Ctx } from "@/lib/league";
import { Nav } from "./nav";

export function Shell({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) {
  return (
    <>
      <Nav ctx={ctx} />
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:pb-8">{children}</main>
    </>
  );
}
