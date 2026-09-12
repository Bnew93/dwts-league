import { getCtx } from "@/lib/league";
import { Shell } from "@/components/shell";

export default async function StandingsPage() {
  const ctx = await getCtx();
  const { league, members } = ctx;

  return (
    <Shell ctx={ctx}>
      <h1 className="text-2xl font-bold">Standings</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Season {league.season} · draft {league.draft_status}
      </p>

      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Members</h2>
        <ul className="mt-3 divide-y divide-zinc-800">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <span>{m.display_name}</span>
              {m.role === "commissioner" && (
                <span className="rounded bg-mirror/20 px-2 py-0.5 text-xs text-mirror">Commissioner</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {league.draft_status !== "complete" && (
        <p className="mt-6 text-center text-zinc-500">
          Standings appear after the draft is complete.
        </p>
      )}
    </Shell>
  );
}
