/**
 * Procedural mirrorball as SVG markup. Tiles sit on a true spherical grid and are
 * projected to the viewer, so they foreshorten toward the rim; each is lit by a
 * key light from the upper left with a specular hot spot and occasional glints.
 * Deterministic for a given seed. Used by the React component, the favicon and
 * the share card (as a data URI), so the ball is identical everywhere.
 */

export type MirrorballOptions = {
  /** rendered px size (viewBox is always 200) */
  size?: number;
  seed?: number;
  /** tile edge length in viewBox units; smaller = more tiles */
  tile?: number;
  /** wrap the tile layer in a class the page can animate */
  tileClass?: string;
  /** include the soft gold glow behind the ball */
  glow?: boolean;
  /** unique id prefix so several balls can share a page */
  id?: string;
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const f = (n: number) => n.toFixed(2);

export function mirrorballSvg({ size = 100, seed = 7, tile = 9.5, tileClass, glow = true, id = "mb" }: MirrorballOptions = {}): string {
  const rand = rng(seed);
  const cx = 100;
  const cy = 100;
  const r = 92;
  // key light: upper-left, toward viewer
  const L = norm([-0.45, 0.62, 0.65]);

  const tiles: string[] = [];
  const glints: { x: number; y: number; s: number }[] = [];
  const latStep = (tile / r) * (180 / Math.PI) * 0.98;
  for (let latDeg = -84; latDeg <= 84; latDeg += latStep) {
    const lat = (latDeg * Math.PI) / 180;
    const ringR = r * Math.cos(lat);
    const n = Math.max(6, Math.round((2 * Math.PI * ringR) / tile));
    const phase = rand() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const lon = phase + (k / n) * Math.PI * 2;
      const nz = Math.cos(lat) * Math.cos(lon);
      if (nz <= 0.02) continue; // back hemisphere
      const nx = Math.cos(lat) * Math.sin(lon);
      const ny = Math.sin(lat);
      const px = cx + r * nx;
      const py = cy - r * ny;
      // projected tangent vectors (half-edge)
      const h = (tile * 0.84) / 2;
      const eLon = [Math.cos(lon) * h, 0];
      const eLat = [-Math.sin(lat) * Math.sin(lon) * h, -Math.cos(lat) * h];
      const c = [
        [px - eLon[0] - eLat[0], py - eLon[1] - eLat[1]],
        [px + eLon[0] - eLat[0], py + eLon[1] - eLat[1]],
        [px + eLon[0] + eLat[0], py + eLon[1] + eLat[1]],
        [px - eLon[0] + eLat[0], py - eLon[1] + eLat[1]],
      ];
      // lighting
      const ndl = nx * L[0] + ny * L[1] + nz * L[2];
      const diffuse = clamp(ndl, 0, 1);
      // specular: reflect view (0,0,1) about n → compare with L
      const rz = 2 * nz * nz - 1;
      const rx = 2 * nz * nx;
      const ry = 2 * nz * ny;
      const spec = Math.pow(clamp(rx * L[0] + ry * L[1] + rz * L[2], 0, 1), 18);
      const jitter = (rand() - 0.5) * 0.18;
      const purple = rand() < 0.2;
      const glint = rand() < 0.045 && diffuse > 0.35;
      let light = 0.3 + diffuse * 0.48 + spec * 0.6 + jitter;
      if (glint) light = 1;
      light = clamp(light, 0.08, 1);
      const hue = purple ? 268 : 252;
      const sat = purple ? 48 - light * 22 : 12;
      const lum = purple ? 30 + light * 50 : 34 + light * 60;
      const fill = glint ? "#ffffff" : `hsl(${hue} ${f(sat)}% ${f(lum)}%)`;
      tiles.push(`<polygon points="${c.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" fill="${fill}"/>`);
      if (glint && glints.length < 5) glints.push({ x: px, y: py, s: 6 + rand() * 8 });
    }
  }

  const star = (x: number, y: number, s: number) =>
    `<path d="M${f(x)} ${f(y - s)} Q${f(x)} ${f(y)} ${f(x + s)} ${f(y)} Q${f(x)} ${f(y)} ${f(x)} ${f(y + s)} Q${f(x)} ${f(y)} ${f(x - s)} ${f(y)} Q${f(x)} ${f(y)} ${f(x)} ${f(y - s)}Z" fill="#fff" opacity=".9"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="mirrorball">
<defs>
  <radialGradient id="${id}-body" cx="38%" cy="32%" r="72%"><stop offset="0" stop-color="#5a5470"/><stop offset=".6" stop-color="#1c1730"/><stop offset="1" stop-color="#090712"/></radialGradient>
  <radialGradient id="${id}-spec" cx="34%" cy="28%" r="34%"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".55" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}-rim" cx="50%" cy="50%" r="50%"><stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient>
  <radialGradient id="${id}-glow" cx="50%" cy="50%" r="50%"><stop offset=".55" stop-color="#e9c250" stop-opacity=".55"/><stop offset="1" stop-color="#e9c250" stop-opacity="0"/></radialGradient>
  <clipPath id="${id}-clip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
</defs>
${glow ? `<circle cx="${cx}" cy="${cy}" r="100" fill="url(#${id}-glow)"/>` : ""}
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-body)"/>
<g clip-path="url(#${id}-clip)"${tileClass ? ` class="${tileClass}"` : ""} style="transform-origin:${cx}px ${cy}px">${tiles.join("")}</g>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-spec)"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-rim)"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f5d97a" stroke-opacity=".55" stroke-width="1.6"/>
<circle cx="${cx}" cy="${cy}" r="${r - 1.2}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1"/>
${glints.map((g) => star(g.x, g.y, g.s)).join("")}
</svg>`;
}

function norm(v: number[]) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function mirrorballDataUri(opts: MirrorballOptions = {}) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(mirrorballSvg(opts))}`;
}
