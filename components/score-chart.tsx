/**
 * Single-series bar chart of weekly judges' totals. Server-rendered SVG, no library.
 * One hue (the mirror gold), thin bars with 4px rounded tops anchored at the baseline,
 * recessive gridlines, direct labels only on the latest and the best week, native
 * <title> tooltips on every bar, and a text table fallback for screen readers.
 */
export function ScoreChart({ weeks, scores }: { weeks: number[]; scores: { week: number; total: number }[] }) {
  const byWeek = new Map(scores.map((s) => [s.week, s.total]));
  const max = Math.max(30, ...scores.map((s) => s.total));
  const W = 560;
  const H = 180;
  const padL = 28;
  const padB = 22;
  const padT = 14;
  const plotW = W - padL - 8;
  const plotH = H - padT - padB;
  const slot = plotW / Math.max(1, weeks.length);
  const barW = Math.min(28, slot * 0.6);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const best = scores.reduce((a, s) => (s.total > a.total ? s : a), scores[0]);
  const latest = scores[scores.length - 1];
  const ticks = [0, Math.round(max / 2), max];

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Weekly judges' scores">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#3a2a55" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#a7a4b3">
              {t}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const v = byWeek.get(w);
          const cx = padL + slot * i + slot / 2;
          const isLabel = v != null && (w === best.week || w === latest.week);
          return (
            <g key={w}>
              {v != null && (
                <>
                  <path
                    d={roundedTopBar(cx - barW / 2, y(v), barW, padT + plotH - y(v), 4)}
                    fill="#e9c46a"
                    opacity={w === latest.week ? 1 : 0.8}
                  >
                    <title>{`Week ${w}: ${v}`}</title>
                  </path>
                  {isLabel && (
                    <text x={cx} y={y(v) - 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#f3f2f7">
                      {v}
                    </text>
                  )}
                </>
              )}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize="10" fill={v != null ? "#d8d6e0" : "#6b6880"}>
                {w}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Weekly judges&apos; scores</caption>
        <tbody>
          {scores.map((s) => (
            <tr key={s.week}>
              <th scope="row">Week {s.week}</th>
              <td>{s.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function roundedTopBar(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
