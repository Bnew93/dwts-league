/**
 * Seeds the league row (if missing) and the sign-in allowlist from seed/members.json.
 * Members who already signed in are attached to the league immediately.
 *
 * Run: npm run seed:members   (needs SUPABASE_SERVICE_ROLE_KEY in .env.local)
 * Or print SQL: npx tsx scripts/seed-members.ts --sql
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const LEAGUE_NAME = "DWTS League";
const SEASON = 35;

type Member = { email: string; display_name: string; commissioner: boolean };

function load(): Member[] {
  const members = JSON.parse(readFileSync("seed/members.json", "utf8")) as Member[];
  if (members.filter((m) => m.commissioner).length !== 1) throw new Error("exactly one commissioner required");
  return members;
}

function toSql(members: Member[]) {
  const vals = members
    .map((m) => `(lower('${m.email}'), (select id from public.leagues where season = ${SEASON} limit 1), '${m.display_name.replace(/'/g, "''")}', ${m.commissioner})`)
    .join(",\n  ");
  return [
    `insert into public.leagues (name, season) select '${LEAGUE_NAME}', ${SEASON} where not exists (select 1 from public.leagues where season = ${SEASON});`,
    `insert into public.allowed_emails (email, league_id, display_name, is_commissioner) values\n  ${vals}\non conflict (email) do update set display_name = excluded.display_name, is_commissioner = excluded.is_commissioner, league_id = excluded.league_id;`,
    // attach anyone who already has an auth account
    `insert into public.league_members (league_id, user_id)
select a.league_id, u.id from public.allowed_emails a join auth.users u on lower(u.email) = a.email
on conflict do nothing;`,
    `update public.profiles p set role = case when a.is_commissioner then 'commissioner' else 'member' end
from public.allowed_emails a join auth.users u on lower(u.email) = a.email where p.id = u.id;`,
  ].join("\n");
}

async function main() {
  const members = load();
  if (process.argv.includes("--sql")) {
    console.log(toSql(members));
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing (or use --sql)");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  let { data: league } = await sb.from("leagues").select("id").eq("season", SEASON).limit(1).maybeSingle();
  if (!league) {
    const ins = await sb.from("leagues").insert({ name: LEAGUE_NAME, season: SEASON }).select("id").single();
    if (ins.error) throw ins.error;
    league = ins.data;
  }
  const up = await sb.from("allowed_emails").upsert(
    members.map((m) => ({
      email: m.email.toLowerCase(),
      league_id: league!.id,
      display_name: m.display_name,
      is_commissioner: m.commissioner,
    })),
  );
  if (up.error) throw up.error;
  console.log(`Seeded ${members.length} allowed emails for league ${league!.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
