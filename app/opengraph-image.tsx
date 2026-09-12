import { ImageResponse } from "next/og";
import { BRAND, TAGLINE } from "@/lib/brand";

export const runtime = "edge";
export const alt = BRAND;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Google Fonts serves TTF to old user agents; Satori needs TTF/OTF/WOFF (not woff2). */
async function googleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}:ital,wght@1,${weight}&text=${encodeURIComponent(text)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:20.0) Gecko/20100101 Firefox/20.0" },
    }).then((r) => r.text());
    const url = /src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const display = await googleFont("Playfair+Display", 600, BRAND + "Season 35");
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
        <div style={{ position: "absolute", left: 92, top: 175, width: 260, height: 260, borderRadius: 9999, background: "radial-gradient(circle at 35% 30%, #ffffff 0%, #b9b6c9 55%, #4c4860 100%)", boxShadow: "0 0 90px rgba(233,194,80,0.55)", display: "flex" }} />
        <div style={{ position: "absolute", left: 92, top: 175, width: 260, height: 260, borderRadius: 9999, border: "3px solid rgba(245,217,122,0.55)", display: "flex" }} />
        {/* facets */}
        {[
          [150, 210], [200, 200], [250, 215], [300, 245], [130, 265], [180, 275], [230, 290], [280, 310], [160, 330], [210, 345], [260, 365], [310, 350], [190, 395], [240, 405],
        ].map(([x, y], i) => (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: 26, height: 26, borderRadius: 4, background: i % 3 === 0 ? "#f3f2f7" : i % 3 === 1 ? "#c9c6d6" : "#8f8ba1", opacity: 0.9, transform: `rotate(${(i * 23) % 30 - 15}deg)` }} />
        ))}

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
      fonts: display ? [{ name: "Playfair", data: display, style: "italic", weight: 600 }] : [],
    },
  );
}
