import Link from "next/link";
import type { Couple } from "@/lib/types";
import { OWNER_BG } from "@/lib/colors";
import { StatusChip } from "./status-chip";

/*
 * One photo, four sizes. All four read the same 3:4 promo shot; faces sit in the
 * top fifth so every crop anchors there (`object-position: 50% 18%`).
 *   <CoupleMarquee>  A · portrait poster — cast grid, desktop draft panel
 *   <CoupleRow>      B · list row — rosters, team, phone draft list, admin
 *   <CoupleTicket>   C · feature card — couple header, confirm dialog, champion
 *   <CoupleMini>     D · chip / <CoupleTile> board cell
 */

const isOut = (c: Couple) => c.status === "eliminated" || c.status === "withdrew";

function Photo({ couple, className = "", dim }: { couple: Couple; className?: string; dim?: boolean }) {
  const out = dim ?? isOut(couple);
  if (couple.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={couple.image_url}
        alt={`${couple.celebrity} and ${couple.professional}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`h-full w-full object-cover object-[50%_18%] transition-[transform,filter] duration-500 ${out ? "saturate-0 brightness-[.55]" : ""} ${className}`}
      />
    );
  }
  const initials = couple.celebrity
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
  return (
    <span className={`display flex h-full w-full items-center justify-center bg-gradient-to-br from-plum-600 to-plum-800 text-silver-300 ${className}`}>{initials}</span>
  );
}

function ownerBg(owner?: number | null) {
  return owner == null || owner < 0 ? "bg-silver-500/40" : OWNER_BG[owner % OWNER_BG.length];
}

/** Couple detail lives under the league: /l/[slug]/couples/[id]. No slug → no link. */
function coupleHref(slug: string | undefined, id: string): string | null {
  return slug ? `/l/${slug}/couples/${id}` : null;
}

/* ---------------------------------------------------------------- A. Marquee */
export function CoupleMarquee({
  couple,
  owner,
  slug,
  href = coupleHref(slug, couple.id),
  corner,
  onClick,
  disabled,
  className = "",
}: {
  couple: Couple;
  owner?: number | null;
  /** league slug for the detail link */
  slug?: string;
  href?: string | null;
  /** top-right slot; defaults to the status chip */
  corner?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const out = isOut(couple);
  const inner = (
    <>
      <Photo couple={couple} className="absolute inset-0 group-hover:scale-[1.04]" />
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(14_7_22/.15),transparent_35%,rgb(14_7_22/.35)_60%,rgb(14_7_22/.92))]" />
      <span className="absolute left-2.5 top-2.5 z-10 rounded-md bg-plum-950/60 px-1.5 py-0.5 text-[11px] font-semibold text-silver-300 backdrop-blur-sm">#{couple.cast_order}</span>
      <span className="absolute right-2 top-2 z-10">{corner ?? <StatusChip couple={couple} />}</span>
      <span className="absolute inset-x-3 bottom-2.5 z-10 grid gap-px text-left">
        <b className={`display text-[17px] font-semibold leading-[1.1] tracking-tight drop-shadow-[0_2px_12px_rgb(0_0_0/.7)] ${out ? "text-silver-500" : "text-silver-100"}`}>{couple.celebrity}</b>
        <small className="text-[11.5px] text-silver-300">with {couple.professional}</small>
      </span>
      <span className={`absolute inset-x-0 bottom-0 z-20 h-[3px] ${ownerBg(owner)}`} />
      {out && <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-6xl font-light text-silver-100/50">✕</span>}
    </>
  );
  const cls = `group relative block w-full aspect-[3/4] overflow-hidden rounded-2xl border hairline bg-plum-800 text-left transition-[transform,box-shadow,border-color] duration-300 ${
    disabled ? "cursor-default" : "hover:-translate-y-1 hover:border-gold-400/60 hover:shadow-glow-sm"
  } ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls}>
        {inner}
      </button>
    );
  }
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/* -------------------------------------------------------------------- B. Row */
export function CoupleRow({
  couple,
  owner,
  slug,
  href = coupleHref(slug, couple.id),
  right,
  note,
  onClick,
  disabled,
  className = "",
}: {
  couple: Couple;
  owner?: number | null;
  /** league slug for the detail link */
  slug?: string;
  href?: string | null;
  /** right column; defaults to the status chip */
  right?: React.ReactNode;
  /** third text line; defaults to notability; pass null to hide */
  note?: React.ReactNode | null;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const out = isOut(couple);
  const inner = (
    <>
      <span className={`absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r-[3px] ${out ? "bg-silver-500/40" : ownerBg(owner)}`} />
      <span className="h-[72px] w-[58px] shrink-0 overflow-hidden rounded-[10px] bg-plum-800 shadow-[0_0_0_1px_rgb(233_194_80/.35),0_6px_16px_-8px_rgb(233_194_80/.5)]">
        <Photo couple={couple} />
      </span>
      <span className="grid min-w-0 flex-1 gap-px text-left">
        <b className={`display truncate text-[17px] font-semibold leading-[1.15] tracking-tight ${out ? "text-silver-500 line-through decoration-silver-500/50" : "text-silver-100"}`}>
          {couple.celebrity}
        </b>
        <span className="truncate text-[12.5px] text-silver-300">with {couple.professional}</span>
        {note === undefined ? (
          couple.notability && <span className="truncate text-xs text-silver-500">{couple.notability}</span>
        ) : note === null ? null : (
          <span className="truncate text-xs text-silver-500">{note}</span>
        )}
      </span>
      <span className="grid shrink-0 justify-items-end gap-1 text-xs text-silver-500">{right ?? <StatusChip couple={couple} />}</span>
    </>
  );
  const cls = `glass relative flex w-full items-center gap-3.5 overflow-hidden py-2.5 pl-3 pr-3.5 ${disabled ? "" : "glass-hover"} ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls}>
        {inner}
      </button>
    );
  }
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/* ----------------------------------------------------------------- C. Ticket */
export function CoupleTicket({
  couple,
  eyebrow,
  foot,
  className = "",
}: {
  couple: Couple;
  eyebrow?: React.ReactNode;
  /** footer row; defaults to the status chip */
  foot?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass grid min-h-[190px] grid-cols-[140px_1fr] overflow-hidden sm:grid-cols-[170px_1fr] ${className}`}>
      <span className="relative overflow-hidden">
        <Photo couple={couple} className="absolute inset-0" />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent_60%,rgb(23_12_37/.95))]" />
      </span>
      <span className="relative grid content-center gap-0.5 py-4 pl-2 pr-4 before:absolute before:-left-px before:bottom-3.5 before:top-3.5 before:border-l-2 before:border-dashed before:border-gold-400/25">
        {eyebrow !== undefined ? <span className="eyebrow">{eyebrow}</span> : <span className="eyebrow">Cast #{couple.cast_order}</span>}
        <b className="display mt-0.5 text-[26px] font-semibold leading-[1.05] tracking-tight text-silver-100">{couple.celebrity}</b>
        <span className="text-sm text-silver-300">with {couple.professional}</span>
        <span className="text-[12.5px] text-silver-500">{couple.notability}</span>
        <span className="mt-2.5 flex items-center justify-between gap-2 border-t hairline pt-2.5">{foot ?? <StatusChip couple={couple} />}</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- D. Mini */
export function CoupleMini({ couple, owner, size = 30, label = true, className = "" }: { couple: Couple; owner?: number | null; size?: number; label?: boolean; className?: string }) {
  const out = isOut(couple);
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border hairline bg-plum-800/80 py-1 pl-1 ${label ? "pr-2.5" : "pr-1"} text-xs leading-[1.1] ${className}`}>
      <span
        className={`shrink-0 overflow-hidden rounded-full ring-2 ${out ? "ring-silver-500/40" : owner == null || owner < 0 ? "ring-silver-500/50" : OWNER_BG[owner % OWNER_BG.length].replace("bg-", "ring-")}`}
        style={{ width: size, height: size }}
      >
        <Photo couple={couple} className="object-[50%_12%]" />
      </span>
      {label && (
        <span className={`grid ${out ? "text-silver-500" : "text-silver-100"}`}>
          {couple.celebrity.split(" ")[0]}
          <small className="text-[10.5px] text-silver-500">{couple.professional.split(" ")[0]}</small>
        </span>
      )}
    </span>
  );
}

/** Round face only, for avatar stacks. */
export function CoupleFace({ couple, size = 28, ring = "ring-plum-950", className = "" }: { couple: Couple; size?: number; ring?: string; className?: string }) {
  return (
    <span className={`inline-block shrink-0 overflow-hidden rounded-full ring-2 ${ring} ${className}`} style={{ width: size, height: size }}>
      <Photo couple={couple} className="object-[50%_12%]" />
    </span>
  );
}

/** Draft-board cell. */
export function CoupleTile({ couple, pickNo, auto, className = "" }: { couple: Couple; pickNo: number; auto?: boolean; className?: string }) {
  return (
    <span className={`relative block h-[74px] overflow-hidden rounded-[10px] border border-plum-600/60 bg-plum-900 ${className}`}>
      <Photo couple={couple} className="absolute inset-0 object-[50%_12%] opacity-85" />
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgb(14_7_22/.95))]" />
      <i className="absolute left-2 top-1.5 z-10 text-[10px] not-italic text-silver-300">#{pickNo}</i>
      <b className="absolute inset-x-2 bottom-1.5 z-10 truncate text-xs font-semibold text-silver-100">
        {couple.celebrity}
        {auto && <span className="ml-1 font-normal text-silver-500">auto</span>}
      </b>
    </span>
  );
}
