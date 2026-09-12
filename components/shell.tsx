import Link from "next/link";
import type { Ctx } from "@/lib/league";
import { Nav } from "./nav";

export function Shell({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) {
  return (
    <>
      <Nav ctx={ctx} />
      {ctx.league.is_mock && (
        <div className="bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-200">
          Mock draft mode · nothing here counts.
          {ctx.isCommissioner && (
            <>
              {" "}
              <Link href="/admin" className="underline">
                End it in Admin
              </Link>
            </>
          )}
        </div>
      )}
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:pb-8">{children}</main>
    </>
  );
}
