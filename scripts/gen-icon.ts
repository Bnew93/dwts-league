/** Regenerates app/icon.svg from the shared mirrorball generator. `npx tsx scripts/gen-icon.ts` */
import { writeFileSync } from "node:fs";
import { mirrorballSvg } from "../lib/mirrorball";

const ball = mirrorballSvg({ size: 64, seed: 7, tile: 13, glow: false, id: "ic" })
  .replace(/^<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<rect width="200" height="200" rx="44" fill="#170c25"/>
<circle cx="100" cy="100" r="100" fill="#e9c250" opacity=".18"/>
<g transform="translate(100 100) scale(.86) translate(-100 -100)">${ball}</g>
</svg>
`;
writeFileSync("app/icon.svg", svg);
console.log("wrote app/icon.svg", svg.length, "bytes");
