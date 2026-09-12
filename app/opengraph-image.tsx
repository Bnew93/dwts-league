import { ImageResponse } from "next/og";
import { BRAND, TAGLINE } from "@/lib/brand";
import { mirrorballDataUri } from "@/lib/mirrorball";

export const runtime = "edge";
export const alt = BRAND;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Bundled display face (Satori needs TTF/OTF/WOFF). Falls back to the built-in font if it can't load. */
async function displayFont(): Promise<ArrayBuffer | null> {
  try {
    return await fetch(new URL("./fonts/PlayfairDisplay-SemiBoldItalic.woff", import.meta.url)).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const display = await displayFont();
  const strips = Array.from({ length: 14 }, (_, i) => i);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #170c25 0%, #0e0716 60%, #1a0f10 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* spotlight */}
        <div style={{ position: "absolute", left: 200, top: -260, width: 800, height: 600, borderRadius: 9999, background: "radial-gradient(circle, rgba(233,194,80,0.42) 0%, rgba(233,194,80,0) 70%)" }} />
        {/* gold light strips, left wing */}
        {strips.map((i) => (
          <div key={`l${i}`} style={{ position: "absolute", left: -120 + i * 34, top: -80, width: 2, height: 900, background: "rgba(233,194,80,0.22)", transform: "rotate(24deg)" }} />
        ))}
        {/* right wing */}
        {strips.map((i) => (
          <div key={`r${i}`} style={{ position: "absolute", right: -120 + i * 34, top: -80, width: 2, height: 900, background: "rgba(233,194,80,0.22)", transform: "rotate(-24deg)" }} />
        ))}
        {/* floor */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 150, background: "linear-gradient(180deg, rgba(120,72,30,0) 0%, rgba(120,72,30,0.35) 60%, rgba(60,34,14,0.7) 100%)" }} />

        {/* mirrorball */}
        <img src={mirrorballDataUri({ size: 300, seed: 7, tile: 8.5, id: "og" })} width={300} height={300} style={{ position: "absolute", left: 72, top: 165 }} alt="" />

        {/* copy */}
        <div style={{ position: "absolute", left: 420, top: 150, right: 70, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 22, letterSpacing: 6, color: "#e9c250", fontWeight: 700 }}>SEASON 35 · FANTASY LEAGUE</div>
          <div style={{ marginTop: 18, fontFamily: display ? "Playfair" : "serif", fontStyle: "italic", fontSize: 88, lineHeight: 1.0, color: "#f3f2f7", display: "flex", flexDirection: "column" }}>
            <span>Drafting on the</span>
            <span style={{ color: "#f5d97a" }}>Dance Floor</span>
          </div>
          <div style={{ marginTop: 26, fontSize: 26, color: "#d8d6e0" }}>{TAGLINE}</div>
          <div style={{ marginTop: 34, fontSize: 20, color: "#a7a4b3", letterSpacing: 1 }}>dwts-league.vercel.app</div>
        </div>
      </div>
    ),
    {
      ...size,
      // omit `fonts` entirely when the file is unavailable so the renderer keeps its default font
      ...(display ? { fonts: [{ name: "Playfair", data: display, style: "italic" as const, weight: 600 as const }] } : {}),
    },
  );
}
