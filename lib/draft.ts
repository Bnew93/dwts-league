/**
 * Draft math shared by the UI. Mirrors `fn_pick_owner` in SQL — the server is
 * authoritative; this only renders the board and the on-the-clock banner.
 */

/** Owner of 1-based pick number `pickNo` in a snake draft over `order`. */
export function pickOwner(order: string[], pickNo: number): string {
  const n = order.length;
  const idx = (pickNo - 1) % n;
  const round = Math.floor((pickNo - 1) / n);
  return round % 2 === 0 ? order[idx] : order[n - 1 - idx];
}

export function roundOf(pickNo: number, users: number): number {
  return Math.floor((pickNo - 1) / users) + 1;
}

export type BoardCell = { pickNo: number; round: number; userId: string };

/** rounds × users grid in pick order; each row is a round in board (not pick) order. */
export function buildBoard(order: string[], rosterSize: number): BoardCell[][] {
  const rows: BoardCell[][] = [];
  for (let r = 1; r <= rosterSize; r++) {
    const row: BoardCell[] = [];
    for (let i = 0; i < order.length; i++) {
      const pickNo = (r - 1) * order.length + i + 1;
      row.push({ pickNo, round: r, userId: pickOwner(order, pickNo) });
    }
    rows.push(row);
  }
  return rows;
}

/** Seconds remaining on the clock; never negative. */
export function secondsLeft(turnStartedAt: string | null, pickSeconds: number, nowMs = Date.now()): number {
  if (!turnStartedAt) return 0;
  const end = new Date(turnStartedAt).getTime() + pickSeconds * 1000;
  return Math.max(0, Math.ceil((end - nowMs) / 1000));
}

/** Number of couples that will go undrafted if the board plays out. */
export function leftoverCount(coupleCount: number, users: number, rosterSize: number): number {
  return Math.max(0, coupleCount - users * rosterSize);
}

/** Roster math shared by the wizard and the commissioner page: floor(couples / players), remainder to Leftovers. */
export function rosterMath(coupleCount: number, players: number) {
  const p = Math.max(1, players);
  return { rosterSize: Math.floor(coupleCount / p), leftovers: coupleCount % p };
}
