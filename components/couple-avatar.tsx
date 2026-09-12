import type { Couple } from "@/lib/types";

type Size = "sm" | "md" | "lg" | "xl";
const DIM: Record<Size, { main: number; pro: number; text: string }> = {
  sm: { main: 36, pro: 18, text: "text-sm" },
  md: { main: 48, pro: 24, text: "text-base" },
  lg: { main: 64, pro: 30, text: "text-xl" },
  xl: { main: 96, pro: 42, text: "text-3xl" },
};

function Face({ src, name, size, ring, className = "" }: { src: string | null; name: string; size: number; ring: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${ring} ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-plum-600 to-plum-800 font-semibold text-silver-100"
          style={{ fontSize: Math.max(10, size * 0.36) }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}

/**
 * Couple photo: the celebrity large with the pro tucked at the bottom-right.
 * Falls back to initials when a photo is missing. `dim` greys out eliminated couples.
 */
export function CoupleAvatar({ couple, size = "md", dim = false, className = "" }: { couple: Couple; size?: Size; dim?: boolean; className?: string }) {
  const d = DIM[size];
  return (
    <span className={`relative inline-block shrink-0 ${dim ? "opacity-50 saturate-0" : ""} ${className}`} style={{ width: d.main + d.pro * 0.35, height: d.main }}>
      <Face src={couple.celebrity_image_url} name={couple.celebrity} size={d.main} ring="ring-2 ring-gold-400/70 shadow-[0_0_14px_-2px_rgb(233_194_80/0.55)]" />
      <Face
        src={couple.pro_image_url}
        name={couple.professional}
        size={d.pro}
        ring="ring-2 ring-plum-950"
        className="absolute -bottom-0.5 -right-0"
      />
    </span>
  );
}
