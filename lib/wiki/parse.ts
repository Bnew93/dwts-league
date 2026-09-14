/**
 * Wikipedia season-page parser. Pure function, no dependencies, no DOM —
 * so it runs unchanged in Node (tests, scripts) and Deno (Edge Function).
 *
 * Input: the HTML returned by the MediaWiki Parse API (`action=parse&prop=text`).
 * Output: the couples table and the weekly judges' scores.
 *
 * Change this file only alongside a new fixture in `fixtures/` that shows the case.
 */

export type CoupleStatus = "active" | "eliminated" | "withdrew" | "finalist";

export type ParsedCouple = {
  celebrity: string;
  celebrityKey: string;
  professional: string;
  notability: string;
  /** Wikipedia article titles (from the cell links), used to fetch page thumbnails. */
  celebrityWiki: string | null;
  professionalWiki: string | null;
  /** 1-based row order in the Wikipedia cast table (ABC reveal order). */
  castOrder: number;
  status: CoupleStatus;
  /** Raw status cell text, e.g. "Eliminated 1st & 2nd on September 23, 2025". */
  statusText: string;
  /** Ordinal(s) from "Eliminated 3rd" / "Eliminated 1st & 2nd". */
  eliminationOrdinals: number[];
  /** ISO date (YYYY-MM-DD) from "on September 23, 2025". */
  eliminationDate: string | null;
  /** 1 = winner. Eliminated couples get count − ordinal + 1 (ties share). */
  placement: number | null;
};

export type ParsedScore = {
  /** e.g. "Robert & Witney" */
  label: string;
  celebrityFirst: string;
  proFirst: string;
  week: number;
  total: number;
  raw: string;
};

export type ParsedSeason = {
  couples: ParsedCouple[];
  scores: ParsedScore[];
  placements: ParsedPlacement[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/** Cell HTML → plain text: drop reference superscripts, break on <br>, strip tags, tidy whitespace. */
export function cellText(html: string): string {
  return decodeEntities(
    html
      .replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

type Cell = { text: string; html: string; header: boolean };

/** Expand a <table> into a rectangular grid, carrying rowspan/colspan cells into the slots they cover. */
export function tableToGrid(tableHtml: string): Cell[][] {
  const rows = tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  const grid: Cell[][] = [];
  // pending[rowIdx][colIdx] = cell carried down by rowspan
  const pending: Record<number, Record<number, Cell>> = {};

  rows.forEach((rowHtml, r) => {
    const out: Cell[] = [];
    const carried = pending[r] ?? {};
    const cellRe = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi;
    let col = 0;
    let m: RegExpExecArray | null;
    const place = (cell: Cell, rowspan: number, colspan: number) => {
      for (let c = 0; c < colspan; c++) {
        while (carried[col]) {
          out[col] = carried[col];
          col++;
        }
        out[col] = cell;
        for (let dr = 1; dr < rowspan; dr++) {
          pending[r + dr] ??= {};
          pending[r + dr][col] = cell;
        }
        col++;
      }
    };
    while ((m = cellRe.exec(rowHtml))) {
      const attrs = m[2];
      const rowspan = Number(/rowspan="?(\d+)/i.exec(attrs)?.[1] ?? 1);
      const colspan = Number(/colspan="?(\d+)/i.exec(attrs)?.[1] ?? 1);
      place({ text: cellText(m[3]), html: m[3], header: m[1].toLowerCase() === "th" }, rowspan, colspan);
    }
    // trailing carried cells
    for (const k of Object.keys(carried).map(Number).sort((a, b) => a - b)) {
      if (k >= col) out[k] = carried[k];
    }
    grid.push(Array.from(out, (c) => c ?? { text: "", html: "", header: false }));
  });
  return grid;
}

function findTables(html: string): string[] {
  return html.match(/<table\b[\s\S]*?<\/table>/gi) ?? [];
}

/** First anchor text in a cell, else the whole text. Used where a cell lists a replacement pro. */
function primaryName(cellHtml: string, fallback: string): string {
  const a = /<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(cellHtml);
  return a ? cellText(a[1]) : fallback;
}

/**
 * Article title from the `/wiki/Title` link whose text is the person's name.
 * A celebrity without an article is often linked to their show instead — that
 * link's text won't match, so we return null and the UI falls back to initials.
 */
export function wikiTitle(cellHtml: string, name: string): string | null {
  const re = /<a\b[^>]*href="\/wiki\/([^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const nameKey = normalizeKey(name);
  const parts = nameKey.split("-").filter((p) => p.length > 1);
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(cellHtml))) {
    if (normalizeKey(cellText(m[2])) !== nameKey) continue;
    let title: string;
    try {
      title = decodeURIComponent(m[1]).replace(/_/g, " ");
    } catch {
      title = m[1].replace(/_/g, " ");
    }
    // A piped link like [[Their Show|Celebrity Name]] has matching text but a title that
    // is not the person. Require the title to carry the surname and start like the first name
    // (covers "Valentin Chmerkovskiy" for "Val", and "(comedian)" disambiguations).
    const titleKey = normalizeKey(title);
    if (titleKey.includes(last) && titleKey.startsWith(first.slice(0, 3))) return title;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Status parsing
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const PLACE_WORDS: Record<string, number> = {
  third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
  "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7, "8th": 8,
};

export function parseDate(text: string): string | null {
  const m = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i.exec(text);
  if (!m) return null;
  const mm = String(MONTHS[m[1].toLowerCase()]).padStart(2, "0");
  return `${m[3]}-${mm}-${m[2].padStart(2, "0")}`;
}

export type ParsedStatus = Pick<ParsedCouple, "status" | "eliminationOrdinals" | "eliminationDate"> & {
  /** Explicit placement from the label (winner=1, runner-up=2, "Third place"=3 …). */
  labelPlacement: number | null;
};

export function parseStatus(text: string): ParsedStatus {
  const t = text.toLowerCase();
  const date = parseDate(text);
  const base = { eliminationOrdinals: [] as number[], eliminationDate: date, labelPlacement: null as number | null };

  if (/withdr/.test(t)) return { ...base, status: "withdrew" };
  if (/winner/.test(t)) return { ...base, status: "finalist", labelPlacement: 1 };
  if (/runner/.test(t)) return { ...base, status: "finalist", labelPlacement: 2 };
  const place = /\b(third|fourth|fifth|sixth|seventh|eighth|3rd|4th|5th|6th|7th|8th)[\s-]*place/.exec(t);
  if (place) return { ...base, status: "finalist", labelPlacement: PLACE_WORDS[place[1]] };
  if (/eliminated/.test(t)) {
    const ords = Array.from(t.matchAll(/(\d+)(?:st|nd|rd|th)/g), (m) => Number(m[1]));
    return { ...base, status: "eliminated", eliminationOrdinals: ords };
  }
  // "Participating", empty, or unknown → active
  return { ...base, status: "active" };
}

// ---------------------------------------------------------------------------
// Couples table
// ---------------------------------------------------------------------------

export function normalizeKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isCastTable(grid: Cell[][]): boolean {
  const head = grid[0]?.map((c) => c.text.toLowerCase()) ?? [];
  return head.some((h) => h.startsWith("celebrity")) && head.some((h) => h.startsWith("professional")) && head.some((h) => h === "status");
}

export function parseCouples(html: string, warnings: string[]): ParsedCouple[] {
  const grid = findTables(html).map(tableToGrid).find(isCastTable);
  if (!grid) {
    warnings.push("cast table not found");
    return [];
  }
  const head = grid[0].map((c) => c.text.toLowerCase());
  const col = (prefix: string) => head.findIndex((h) => h.startsWith(prefix));
  const iCeleb = col("celebrity");
  const iNot = col("notability");
  const iPro = col("professional");
  const iStatus = col("status");

  const couples: ParsedCouple[] = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    const celebCell = row[iCeleb];
    if (!celebCell?.text) continue;
    const celebrity = primaryName(celebCell.html, celebCell.text);
    const proCell = row[iPro];
    const professional = proCell ? primaryName(proCell.html, proCell.text) : "";
    const statusText = row[iStatus]?.text ?? "";
    const st = parseStatus(statusText);
    couples.push({
      celebrity,
      celebrityKey: normalizeKey(celebrity),
      professional,
      notability: iNot >= 0 ? row[iNot]?.text ?? "" : "",
      celebrityWiki: wikiTitle(celebCell.html, celebrity),
      professionalWiki: proCell ? wikiTitle(proCell.html, professional) : null,
      castOrder: couples.length + 1,
      status: st.status,
      statusText,
      eliminationOrdinals: st.eliminationOrdinals,
      eliminationDate: st.eliminationDate,
      placement: st.labelPlacement,
    });
  }

  // Eliminated placement = count − highest ordinal in the cell + 1 (shared cells tie).
  const n = couples.length;
  for (const c of couples) {
    if (c.status === "eliminated" && c.eliminationOrdinals.length) {
      c.placement = n - Math.max(...c.eliminationOrdinals) + 1;
    }
  }
  return couples;
}

// ---------------------------------------------------------------------------
// Weekly scores
// ---------------------------------------------------------------------------

function isScoreTable(grid: Cell[][]): boolean {
  const head = grid[0]?.map((c) => c.text.toLowerCase()) ?? [];
  return head[0] === "couple" && head.some((h) => h === "week");
}

/** "38+3=41" → 41 · "40+2=42†" → 42 · "15†" → 15 · "" → null */
export function parseScoreCell(raw: string): number | null {
  const t = raw.replace(/[†‡*]/g, "").replace(/\[.*?\]/g, "").trim();
  if (!t || /^[—–-]+$/.test(t)) return null;
  const eq = t.split("=");
  const tail = eq[eq.length - 1].trim();
  if (/^\d+(\.\d+)?$/.test(tail)) return Number(tail);
  if (eq.length === 1 && /^\d+(\s*\+\s*\d+)+$/.test(t)) {
    return t.split("+").reduce((a, b) => a + Number(b), 0);
  }
  return null;
}

export function parseScores(html: string, warnings: string[]): ParsedScore[] {
  const grid = findTables(html).map(tableToGrid).find(isScoreTable);
  if (!grid || grid.length < 3) {
    warnings.push("scoring chart not found");
    return [];
  }
  // Row 1 holds the per-week labels (row 0 has Couple / Pl. / Week[colspan]).
  const weekRow = grid[1];
  const weekByCol: Record<number, number> = {};
  weekRow.forEach((c, i) => {
    if (/^\d+$/.test(c.text)) weekByCol[i] = Number(c.text);
  });
  const scores: ParsedScore[] = [];
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r];
    const label = row[0]?.text ?? "";
    const parts = label.split("&").map((s) => s.trim());
    if (parts.length !== 2) continue;
    const first = (s: string) => s.split(/\s+/)[0].replace(/\.$/, "");
    for (const [ci, week] of Object.entries(weekByCol)) {
      const cell = row[Number(ci)];
      if (!cell) continue;
      const total = parseScoreCell(cell.text);
      if (total === null) continue;
      scores.push({ label, celebrityFirst: first(parts[0]), proFirst: first(parts[1]), week, total, raw: cell.text });
    }
  }
  return scores;
}

// ---------------------------------------------------------------------------
// Chart placements ("Pl." column) — the second source for eliminations
// ---------------------------------------------------------------------------

export type ParsedPlacement = {
  label: string;
  celebrityFirst: string;
  proFirst: string;
  /** "13th" → 13; blank while the couple is still dancing. */
  placement: number | null;
};

/** "1st" → 1, "13th" → 13; anything else → null. */
export function parseOrdinal(text: string): number | null {
  const m = /^\s*(\d+)\s*(?:st|nd|rd|th)\b/i.exec(text.replace(/\[.*?\]/g, ""));
  return m ? Number(m[1]) : null;
}

/**
 * Placement per couple from the scoring chart's "Pl." column. Editors fill it in the week a
 * couple leaves (fixtures s34-week4 / s34-week6), so it corroborates the cast table's status
 * cell. Tie conventions vary ("13th" or "14th" for a shared 1st & 2nd) — callers tolerate that.
 */
export function parseChartPlacements(html: string, warnings: string[]): ParsedPlacement[] {
  const grid = findTables(html).map(tableToGrid).find(isScoreTable);
  if (!grid || grid.length < 3) {
    warnings.push("scoring chart not found");
    return [];
  }
  const iPl = grid[0].findIndex((c) => /^pl\.?$/i.test(c.text.trim()));
  if (iPl < 0) {
    warnings.push("placement column not found");
    return [];
  }
  const out: ParsedPlacement[] = [];
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r];
    const label = row[0]?.text ?? "";
    const parts = label.split("&").map((s) => s.trim());
    if (parts.length !== 2) continue;
    const first = (s: string) => s.split(/\s+/)[0].replace(/\.$/, "");
    out.push({ label, celebrityFirst: first(parts[0]), proFirst: first(parts[1]), placement: parseOrdinal(row[iPl]?.text ?? "") });
  }
  return out;
}

/** Attach a parsed score row to a couple by first names (celebrity & pro). */
export function matchScoreToCouple(score: ParsedScore | ParsedPlacement, couples: ParsedCouple[]): ParsedCouple | undefined {
  const f = (s: string) => normalizeKey(s.split(/\s+/)[0]);
  const exact = couples.filter(
    (c) => f(c.celebrity) === normalizeKey(score.celebrityFirst) && f(c.professional) === normalizeKey(score.proFirst),
  );
  if (exact.length === 1) return exact[0];
  // fall back to celebrity first name only if unique
  const loose = couples.filter((c) => f(c.celebrity) === normalizeKey(score.celebrityFirst));
  return loose.length === 1 ? loose[0] : undefined;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseSeasonPage(html: string): ParsedSeason {
  const warnings: string[] = [];
  const couples = parseCouples(html, warnings);
  const scores = parseScores(html, warnings);
  const placements = parseChartPlacements(html, warnings);
  return { couples, scores, placements, warnings: Array.from(new Set(warnings)) };
}
