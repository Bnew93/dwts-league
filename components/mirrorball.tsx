/** Mirrorball mark. Faceted disc with a soft glow; spins slowly when `spin` is set. */
export function Mirrorball({ size = 28, spin = true, className = "" }: { size?: number; spin?: boolean; className?: string }) {
  const facets: React.ReactNode[] = [];
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const cols = r === 0 || r === rows - 1 ? 4 : 8;
    for (let c = 0; c < cols; c++) {
      const cx = 50 + Math.cos(((c + (r % 2) * 0.5) / cols) * Math.PI * 2) * (18 + Math.sin((r / (rows - 1)) * Math.PI) * 22);
      const cy = 14 + (r / (rows - 1)) * 72;
      const tone = (r * 7 + c * 13) % 3;
      facets.push(
        <rect
          key={`${r}-${c}`}
          x={cx - 5}
          y={cy - 5}
          width={10}
          height={10}
          rx={1.5}
          fill={tone === 0 ? "#f3f2f7" : tone === 1 ? "#c9c6d6" : "#8f8ba1"}
          opacity={0.95}
          transform={`rotate(${(r * 17 + c * 23) % 30 - 15} ${cx} ${cy})`}
        />,
      );
    }
  }
  return (
    <span className={`relative inline-flex ${className}`} style={{ width: size, height: size }} aria-hidden>
      <span className="absolute inset-0 rounded-full bg-gold-300/40 blur-md" />
      <svg viewBox="0 0 100 100" width={size} height={size} className={`relative ${spin ? "animate-spin-slow" : ""}`}>
        <defs>
          <radialGradient id="mb" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#b9b6c9" />
            <stop offset="100%" stopColor="#4c4860" />
          </radialGradient>
          <clipPath id="mbc">
            <circle cx="50" cy="50" r="46" />
          </clipPath>
        </defs>
        <circle cx="50" cy="50" r="46" fill="url(#mb)" />
        <g clipPath="url(#mbc)">{facets}</g>
        <circle cx="50" cy="50" r="46" fill="none" stroke="#f7dc8a" strokeOpacity="0.5" strokeWidth="1.5" />
      </svg>
    </span>
  );
}
