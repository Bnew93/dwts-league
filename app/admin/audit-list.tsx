import type { AuditRow } from "@/lib/types";

export function AuditList({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <p className="text-sm text-silver-500">No audited actions yet.</p>;
  return (
    <ul className="glass divide-y divide-gold-400/10 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-silver-100">{r.action}</span>
            <span className="text-xs text-silver-500">{new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</span>
          </div>
          <div className="truncate text-xs text-silver-500">
            {r.target && JSON.stringify(r.target)}
            {r.after && ` → ${JSON.stringify(r.after)}`}
          </div>
        </li>
      ))}
    </ul>
  );
}
