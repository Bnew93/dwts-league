import { mirrorballSvg } from "@/lib/mirrorball";

/**
 * Mirrorball mark. Procedural faceted sphere (see lib/mirrorball.ts). `spin` slowly
 * rotates the tile layer while the lighting stays put, so it reads as the ball turning.
 */
export function Mirrorball({ size = 28, spin = true, className = "", seed = 7 }: { size?: number; spin?: boolean; className?: string; seed?: number }) {
  const svg = mirrorballSvg({ size, seed, tileClass: spin ? "mb-tiles" : undefined, id: `mb${seed}` });
  return <span className={`inline-flex shrink-0 leading-none ${className}`} style={{ width: size, height: size }} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}
