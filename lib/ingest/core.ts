/**
 * Results ingestion, the pure part: parsed Wikipedia page + current DB couples + episode
 * schedule → a diff for fn_apply_results, split into what may be applied automatically and
 * what needs a human. No I/O, so the replay test drives it straight from fixtures.
 *
 * Rules (IMPLEMENTATION_PLAN §Phase 3, PHASE_1_5 §3):
 *   - only active → eliminated | withdrew | finalist and placement assignments apply automatically
 *   - anything that would un-eliminate a couple is parked as needs-review
 *   - the cast table (status cell) and the scoring chart ("Pl." column) must agree
 *   - the elimination date must map to an episode; otherwise needs-review
 *   - more than MAX_AUTO_CHANGES changes in one run parks the whole run, except the finale
 */
import type { CoupleStatus, ParsedCouple, ParsedSeason } from "@/lib/wiki/parse";
import { matchScoreToCouple } from "@/lib/wiki/parse";

export type DbCouple = {
  id: string;
  celebrity: string;
  celebrity_key: string;
  status: CoupleStatus;
  elimination_week: number | null;
  elimination_date: string | null;
  placement: number | null;
};

export type EpisodeLite = { week: number; air_date: string };

/** One element of the jsonb array fn_apply_results consumes (extra keys are ignored by SQL). */
export type DiffItem = {
  couple_id: string;
  celebrity: string;
  status: CoupleStatus;
  elimination_week: number | null;
  elimination_date: string | null;
  placement: number | null;
  /** what the scoring chart says, for the admin page */
  chart_placement: number | null;
  /** present only on items that need a human */
  reason?: string;
};

export type Diff = {
  /** safe to apply automatically, in elimination order */
  apply: DiffItem[];
  /** parked for the admin page */
  review: DiffItem[];
  /** non-fatal observations (unmatched couples, missing chart, …) */
  notes: string[];
};

/** A normal week has 1–2 eliminations; a missed week plus a double is 3–4. Beyond that, ask. */
export const MAX_AUTO_CHANGES = 4;

const sameDate = (a: string | null, b: string | null) => (a ?? "") === (b ?? "");

function weekFor(date: string | null, episodes: EpisodeLite[]): number | null {
  if (!date) return null;
  return episodes.find((e) => e.air_date === date)?.week ?? null;
}

/**
 * Placements the chart may legitimately show for a parsed couple. A shared "Eliminated 1st & 2nd"
 * cell is written as either 13th or 14th of 14 depending on the editor, so accept the range.
 */
export function acceptablePlacements(c: ParsedCouple, coupleCount: number): number[] {
  if (c.status === "finalist") return c.placement != null ? [c.placement] : [];
  if (c.eliminationOrdinals.length === 0) return c.placement != null ? [c.placement] : [];
  const lo = coupleCount - Math.max(...c.eliminationOrdinals) + 1;
  const hi = coupleCount - Math.min(...c.eliminationOrdinals) + 1;
  const out: number[] = [];
  for (let p = lo; p <= hi; p++) out.push(p);
  return out;
}

export function buildDiff(parsed: ParsedSeason, db: DbCouple[], episodes: EpisodeLite[]): Diff {
  const notes: string[] = [...parsed.warnings];
  const apply: DiffItem[] = [];
  const review: DiffItem[] = [];
  const byKey = new Map(db.map((c) => [c.celebrity_key, c]));
  const n = parsed.couples.length;

  // chart placement per parsed couple (by first names), null when the chart has no row or no Pl.
  const chartFor = (c: ParsedCouple): number | null | undefined => {
    const hit = parsed.placements.find((p) => matchScoreToCouple(p, parsed.couples) === c);
    return hit ? hit.placement : undefined; // undefined = no chart row at all
  };

  for (const pc of parsed.couples) {
    const dc = byKey.get(pc.celebrityKey);
    if (!dc) {
      notes.push(`page lists ${pc.celebrity}, not in the database`);
      continue;
    }
    const chart = chartFor(pc);
    const chartValue = chart === undefined ? null : chart;
    const base = {
      couple_id: dc.id,
      celebrity: dc.celebrity,
      status: pc.status,
      elimination_week: weekFor(pc.eliminationDate, episodes),
      elimination_date: pc.eliminationDate,
      placement: pc.placement,
      chart_placement: chartValue,
    };
    const park = (reason: string) => review.push({ ...base, reason });

    const leaving = pc.status === "eliminated" || pc.status === "withdrew";
    const dbOut = dc.status === "eliminated" || dc.status === "withdrew";

    // revert guard: page says dancing (or finalist) but we have them out
    if (dbOut && (pc.status === "active" || pc.status === "finalist")) {
      park(`page would un-eliminate ${dc.celebrity} (db: ${dc.status} wk ${dc.elimination_week})`);
      continue;
    }
    // eliminated ↔ withdrew disagreement on an already-out couple
    if (dbOut && leaving && dc.status !== pc.status) {
      park(`status changed from ${dc.status} to ${pc.status}`);
      continue;
    }

    // idempotent: nothing to do
    if (
      dc.status === pc.status &&
      (dc.elimination_week ?? null) === (base.elimination_week ?? null) &&
      (dc.placement ?? null) === (pc.placement ?? null)
    ) {
      continue;
    }

    if (pc.status === "active") continue; // active → active with cosmetic diffs: nothing to write

    // leaving or placing: the chart must corroborate
    const ok = acceptablePlacements(pc, n);
    if (chart === undefined) {
      park("no scoring-chart row for this couple");
      continue;
    }
    if (chart === null) {
      park("scoring chart does not show a placement yet");
      continue;
    }
    if (ok.length && !ok.includes(chart)) {
      park(`cast table says ${pc.placement ?? "?"} but chart says ${chart}`);
      continue;
    }
    if (leaving && base.elimination_week == null) {
      park(`no episode on ${pc.eliminationDate ?? "an unknown date"}`);
      continue;
    }
    if (pc.status === "finalist" && pc.placement == null) {
      park("finalist without a placement");
      continue;
    }
    // withdrew rows carry no ordinal; take the chart's placement
    if (pc.status === "withdrew" && base.placement == null) base.placement = chart;

    apply.push(base);
  }

  for (const dc of db) {
    if (!parsed.couples.some((pc) => pc.celebrityKey === dc.celebrity_key)) notes.push(`${dc.celebrity} is in the database but not on the page`);
  }

  // elimination order drives the replacement-claim queue
  apply.sort((a, b) => (a.elimination_date ?? "").localeCompare(b.elimination_date ?? "") || (b.placement ?? 0) - (a.placement ?? 0));

  const finale = apply.some((i) => i.status === "finalist");
  if (apply.length > MAX_AUTO_CHANGES && !finale) {
    const reason = `${apply.length} changes in one run (limit ${MAX_AUTO_CHANGES}); confirm by hand`;
    review.push(...apply.map((i) => ({ ...i, reason })));
    apply.length = 0;
  }

  return { apply, review, notes };
}

/** Apply diff items to an in-memory copy of the couples (replay tests; mirrors fn_apply_results' couple update). */
export function applyInMemory(db: DbCouple[], items: DiffItem[]): DbCouple[] {
  const out = db.map((c) => ({ ...c }));
  for (const it of items) {
    const c = out.find((x) => x.id === it.couple_id);
    if (!c) continue;
    c.status = it.status;
    c.elimination_week = it.elimination_week ?? c.elimination_week;
    c.elimination_date = it.elimination_date ?? c.elimination_date;
    c.placement = it.placement ?? c.placement;
  }
  return out;
}

export { sameDate };
