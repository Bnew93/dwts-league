/**
 * Results ingestion, the I/O part: fetch the season page, diff it against the database, record
 * an ingest_runs row, and (mode permitting) apply through fn_apply_results — which fans the
 * result out to every league in the season. Used by scripts/ingest.ts (GitHub Action) and the
 * admin Run-now button. Needs a service-role client: ingest_runs and judge_scores have no client
 * write policies, and fn_apply_results accepts the service role without a JWT.
 *
 * Modes: "apply"  — apply the safe part of the diff, park the rest as needs_review
 *        "review" — never apply; a non-empty diff is parked for the admin page (training wheels)
 *        "dry"    — no database writes at all; return what would happen
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSeasonPage, matchScoreToCouple } from "@/lib/wiki/parse";
import { buildDiff, type DbCouple, type Diff, type EpisodeLite } from "./core";

export type IngestMode = "apply" | "review" | "dry";

export type IngestOptions = {
  supabase: SupabaseClient;
  showId: string;
  season: number;
  /** Wikipedia page title (or a label when `html` is given) */
  page: string;
  mode: IngestMode;
  /** run even if no episode aired in the last 48 hours */
  force?: boolean;
  /** pre-fetched HTML (fixtures / tests); otherwise the page is fetched */
  html?: string;
};

export type IngestSummary = {
  runId: string | null;
  status: "ok" | "no_change" | "needs_review" | "error" | "skipped";
  applied: number;
  claims: number;
  review: number;
  scores: number;
  notes: string[];
  diff: Diff;
  contentHash: string | null;
};

const UA = "dwts-league/0.1 (billnewhart19@gmail.com)";

export async function fetchWikiHtml(page: string): Promise<string> {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`wikipedia http ${res.status}`);
  const json = (await res.json()) as { parse?: { text: string }; error?: { info?: string } };
  if (!json.parse) throw new Error(`wikipedia: ${json.error?.info ?? "no parse result"}`);
  return json.parse.text;
}

const empty: Diff = { apply: [], review: [], notes: [] };

export async function runIngest(o: IngestOptions): Promise<IngestSummary> {
  const { supabase, mode } = o;
  const sourceUrl = o.html ? `fixture:${o.page}` : `https://en.wikipedia.org/wiki/${o.page}`;
  const write = mode !== "dry";

  // 1. Is there anything to look for? Skip quiet days unless forced.
  const { data: episodes, error: epErr } = await supabase.from("episodes").select("week, air_date, air_time").eq("show_id", o.showId).eq("season", o.season).order("week");
  if (epErr) throw new Error(`episodes: ${epErr.message}`);
  const now = Date.now();
  const aired48h = (episodes ?? []).some((e) => {
    const t = new Date(e.air_time as string).getTime();
    return t <= now && now - t < 48 * 3600 * 1000;
  });
  if (!aired48h && !o.force) {
    return { runId: null, status: "skipped", applied: 0, claims: 0, review: 0, scores: 0, notes: ["no episode aired in the last 48 hours"], diff: empty, contentHash: null };
  }

  // 2. Record the run first so a crash is visible on the admin page.
  let runId: string | null = null;
  if (write) {
    const { data, error } = await supabase.from("ingest_runs").insert({ status: "running", source_url: sourceUrl }).select("id").single();
    if (error) throw new Error(`ingest_runs insert: ${error.message}`);
    runId = data.id as string;
  }
  const finish = async (patch: Record<string, unknown>) => {
    if (!runId) return;
    await supabase.from("ingest_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", runId);
  };

  try {
    // 3. Fetch + parse
    const html = o.html ?? (await fetchWikiHtml(o.page));
    const contentHash = createHash("sha256").update(html).digest("hex");
    const parsed = parseSeasonPage(html);
    if (parsed.couples.length < 8) throw new Error(`only ${parsed.couples.length} couples parsed; refusing`);

    // 4. Current state
    const { data: rows, error: cErr } = await supabase
      .from("couples")
      .select("id, celebrity, celebrity_key, status, elimination_week, elimination_date, placement")
      .eq("show_id", o.showId)
      .eq("season", o.season);
    if (cErr) throw new Error(`couples: ${cErr.message}`);
    const db = (rows ?? []) as DbCouple[];
    const eps: EpisodeLite[] = (episodes ?? []).map((e) => ({ week: e.week as number, air_date: e.air_date as string }));

    // 5. Diff
    const diff = buildDiff(parsed, db, eps);

    // 6. Judges' scores (non-fatal)
    let scores = 0;
    if (write && parsed.scores.length) {
      const byKey = new Map(db.map((c) => [c.celebrity_key, c.id]));
      const upserts = parsed.scores
        .map((s) => {
          const pc = matchScoreToCouple(s, parsed.couples);
          const id = pc ? byKey.get(pc.celebrityKey) : undefined;
          return id ? { couple_id: id, week: s.week, total: s.total, detail: { raw: s.raw, label: s.label } } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (upserts.length) {
        const { error } = await supabase.from("judge_scores").upsert(upserts, { onConflict: "couple_id,week" });
        if (error) diff.notes.push(`judge_scores: ${error.message}`);
        else scores = upserts.length;
      }
    }

    // 7. Decide + apply
    let applied = 0;
    let claims = 0;
    const toApply = mode === "apply" ? diff.apply : [];
    const parked = mode === "review" ? [...diff.apply, ...diff.review] : diff.review;

    if (write && toApply.length) {
      const { data, error } = await supabase.rpc("fn_apply_results", { p_diff: toApply, p_source: "ingest", p_run_id: runId, p_allow_revert: false });
      if (error) throw new Error(`fn_apply_results: ${error.message}`);
      const r = data as { applied: number; claims: number };
      applied = r.applied;
      claims = r.claims;
    }

    const status: IngestSummary["status"] = parked.length ? "needs_review" : toApply.length || (mode === "dry" && diff.apply.length) ? "ok" : "no_change";
    const storedDiff = parked.length ? parked : toApply;
    await finish({
      status,
      content_hash: contentHash,
      diff: storedDiff.length ? storedDiff : null,
      error: diff.notes.length ? diff.notes.join("; ") : null,
    });
    return { runId, status, applied, claims, review: parked.length, scores, notes: diff.notes, diff, contentHash };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish({ status: "error", error: msg });
    return { runId, status: "error", applied: 0, claims: 0, review: 0, scores: 0, notes: [msg], diff: empty, contentHash: null };
  }
}
