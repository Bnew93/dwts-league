/**
 * Dump every public table (plus a minimal auth.users projection) to backups/<label>.json.
 * Service-role; read-only. Used before schema migrations and by hand when a
 * point-in-time copy of roster state is wanted.
 *
 *   npx tsx scripts/snapshot.ts pre-0013-2026-09-13
 *
 * Restore (per table): insert into public.<t> select * from json_populate_recordset(null::public.<t>, $1::json);
 */
import "dotenv/config";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

config({ path: ".env.local", override: false });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");

const TABLES = [
  "leagues",
  "league_members",
  "profiles",
  "couples",
  "episodes",
  "draft_picks",
  "roster_events",
  "replacement_claims",
  "judge_scores",
  "ingest_runs",
  "results_events",
  "league_invites",
  "activity_log",
  "audit_log",
  "shows",
] as const;

async function main() {
  const label = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const supabase = createClient(url!, key!, { auth: { persistSession: false } });
  const out: Record<string, unknown> = { taken_at: new Date().toISOString() };

  for (const t of TABLES) {
    const { data, error } = await supabase.from(t).select("*").limit(100000);
    if (error) {
      if (/does not exist|relation/i.test(error.message)) {
        out[t] = null;
        continue;
      }
      throw new Error(`${t}: ${error.message}`);
    }
    out[t] = data;
  }
  const { data: users, error: uerr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (uerr) throw new Error(`auth.users: ${uerr.message}`);
  out.auth_users = users.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, user_metadata: u.user_metadata }));

  mkdirSync("backups", { recursive: true });
  const file = `backups/${label}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2));
  const counts = Object.entries(out)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}=${(v as unknown[]).length}`)
    .join(" ");
  console.log(`wrote ${file}\n${counts}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
