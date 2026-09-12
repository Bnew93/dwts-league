import Link from "next/link";
import type { Couple } from "@/lib/types";
import { CoupleAvatar } from "./couple-avatar";
import { StatusChip } from "./status-chip";

/**
 * The standard couple row/card: photo, names, notability, status chip, optional right slot.
 * Renders as a link to the couple page unless `href` is null.
 */
export function CoupleCard({
  couple,
  href = `/couples/${couple.id}`,
  right,
  sub,
  dim,
  compact = false,
  className = "",
}: {
  couple: Couple;
  href?: string | null;
  right?: React.ReactNode;
  sub?: React.ReactNode;
  dim?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const out = dim ?? (couple.status === "eliminated" || couple.status === "withdrew");
  const body = (
    <>
      <CoupleAvatar couple={couple} size={compact ? "sm" : "md"} dim={out} />
      <div className="min-w-0 flex-1">
        <div className={`truncate font-semibold leading-tight ${out ? "text-silver-500" : "text-silver-100"}`}>{couple.celebrity}</div>
        <div className="truncate text-xs text-silver-500">
          with <span className={out ? "" : "text-silver-300"}>{couple.professional}</span>
        </div>
        {sub !== undefined ? (
          <div className="mt-0.5 truncate text-xs text-silver-500">{sub}</div>
        ) : (
          !compact && couple.notability && <div className="mt-0.5 truncate text-xs text-silver-500/80">{couple.notability}</div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">{right ?? <StatusChip couple={couple} />}</div>
    </>
  );
  const cls = `glass glass-hover flex items-center gap-3 ${compact ? "p-2.5" : "p-3"} ${out ? "opacity-80" : ""} ${className}`;
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
