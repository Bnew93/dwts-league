import type { NextConfig } from "next";

/** League-1 legacy routes → /l/og for one season (PHASE_1_5 §10). 308s. */
const LEGACY_LEAGUE_SLUG = "og";

const nextConfig: NextConfig = {
  async redirects() {
    const l = `/l/${LEGACY_LEAGUE_SLUG}`;
    return [
      { source: "/standings", destination: l, permanent: true },
      { source: "/team", destination: `${l}/team`, permanent: true },
      { source: "/bracket", destination: `${l}/bracket`, permanent: true },
      { source: "/draft", destination: `${l}/draft`, permanent: true },
      { source: "/couples/:id", destination: `${l}/couples/:id`, permanent: true },
      { source: "/profile", destination: "/account", permanent: true },
      { source: "/admin/results", destination: "/admin/ingest", permanent: true },
    ];
  },
};

export default nextConfig;
