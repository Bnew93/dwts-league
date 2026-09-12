"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/client";
import type { League, Profile } from "@/lib/league";
import { LEAGUE_COLUMNS } from "@/lib/league-columns";
import { OWNER_BG } from "@/lib/colors";
import type { Couple } from "@/lib/types";
import { serverNow } from "@/app/draft/actions";
import { startDraft } from "@/app/admin/actions";

type Props = { league: League; members: Profile[]; me: string; isCommissioner: boolean; couples: Couple[] };

/**
 * Pre-draft lobby: the dance floor with couple posters drifting behind a countdown to the
 * commissioner-set start. Nothing starts on its own — the commissioner opens the room here.
 */
export function Lobby({ league: initial, members, me, isCommissioner, couples }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [league, setLeague] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [skew, setSkew] = useState(0);
  const [online, setOnline] = useState<Set<string>>(new Set([me]));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // clock
  useEffect(() => {
    serverNow()
      .then((s) => setSkew(s - Date.now()))
      .catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // league changes (schedule edits, the room opening) + presence
  useEffect(() => {
    const ch = supabase
      .channel(`league:${league.id}:lobby`, { config: { presence: { key: me } } })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leagues", filter: `id=eq.${league.id}` }, async () => {
        const { data } = await supabase.from("leagues").select(LEAGUE_COLUMNS).eq("id", league.id).single();
        if (data) setLeague(data as League);
      })
      .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await ch.track({ at: Date.now() });
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, league.id, me]);

  useEffect(() => {
    if (league.draft_status !== "pending") router.refresh();
  }, [league.draft_status, router]);

  const target = league.draft_scheduled_at ? new Date(league.draft_scheduled_at).getTime() : null;
  const ms = target ? Math.max(0, target - (now + skew)) : null;
  const late = target != null && ms === 0;
  const d = ms != null ? Math.floor(ms / 864e5) : 0;
  const h = ms != null ? Math.floor((ms % 864e5) / 36e5) : 0;
  const m = ms != null ? Math.floor((ms % 36e5) / 6e4) : 0;
  const s = ms != null ? Math.floor((ms % 6e4) / 1e3) : 0;
  const pad = (n: number) => String(n).padStart(2, "0");

  const humans = members.filter((x) => !x.is_mock);
  const hereCount = humans.filter((x) => online.has(x.id)).length;
  const canOpen = members.length >= 2 && couples.filter((c) => c.status === "active").length >= members.length * league.roster_size;
  const withPhotos = couples.filter((c) => c.image_url);
  const laneA = withPhotos.filter((_, i) => i % 2 === 0);
  const laneB = withPhotos.filter((_, i) => i % 2 === 1);

  function open() {
    setErr(null);
    start(async () => {
      try {
        await startDraft();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not open the room");
      }
    });
  }

  return (
    <div className="lobby relative min-h-[calc(100dvh-53px)] overflow-hidden">
      <div className="lobby-floor" aria-hidden />
      <div className="lobby-spot left-[5%]" aria-hidden />
      <div className="lobby-spot right-[5%] [animation-direction:alternate-reverse] [animation-duration:13s]" aria-hidden />

      {/* poster lanes */}
      <div className="pointer-events-none absolute inset-0 grid content-between py-16 sm:py-[70px]" aria-hidden>
        <Lane items={laneA} dir="left" />
        <Lane items={laneB} dir="right" />
      </div>
      <div className="lobby-reflect" aria-hidden>
        <Lane items={laneB} dir="right" reflect />
      </div>
      <div className="lobby-scrim" aria-hidden />

      {/* center stage */}
      <section className="relative z-10 mx-auto grid min-h-[calc(100dvh-53px)] max-w-3xl content-center justify-items-center px-5 py-14 text-center">
        <div className="eyebrow">Season {league.season} · Draft night</div>
        <h1 className="display mt-2 text-[clamp(38px,7vw,68px)] font-semibold italic leading-none tracking-tight text-silver-100">
          {late ? "It's draft time" : target ? "The ballroom opens in" : "Draft night is coming"}
        </h1>
        <div className="mt-2 text-[15px] text-silver-300">
          {target ? (
            <>
              <b className="font-medium text-silver-100">{formatInTimeZone(new Date(target), "America/New_York", "EEEE, MMMM d")}</b> ·{" "}
              {formatInTimeZone(new Date(target), "America/New_York", "h:mm a")} ET
            </>
          ) : (
            "The commissioner hasn't set a start time yet."
          )}
        </div>

        {target && (
          <div className={`mt-8 flex items-start justify-center gap-[clamp(6px,2vw,18px)] transition-opacity ${late ? "opacity-35" : ""}`} role="timer">
            <Unit v={pad(d)} label="days" />
            <Colon />
            <Unit v={pad(h)} label="hours" />
            <Colon />
            <Unit v={pad(m)} label="min" />
            <Colon />
            <Unit v={pad(s)} label="sec" />
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2 text-[12.5px] text-silver-300">
          {[
            `${couples.length} couples`,
            `${league.roster_size} rounds · snake`,
            `${league.pick_seconds} seconds a pick`,
            "Auto-pick by cast order",
          ].map((t) => (
            <span key={t} className="rounded-full border hairline bg-plum-950/60 px-3 py-1.5 backdrop-blur-sm">
              {t}
            </span>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          {members.map((p) => {
            const here = online.has(p.id) || p.is_mock;
            const slot = Math.max(0, members.indexOf(p)) % OWNER_BG.length;
            return (
              <span key={p.id} className={`flex items-center gap-2 rounded-full border hairline bg-plum-900/80 py-1.5 pl-1.5 pr-3 text-[13px] ${here ? "" : "opacity-60"}`}>
                <i className={`inline-grid h-[26px] w-[26px] place-items-center rounded-full text-xs font-bold not-italic text-white ${OWNER_BG[slot]}`}>
                  {p.display_name.slice(0, 1)}
                </i>
                {p.display_name}
                <span className={`h-[7px] w-[7px] rounded-full ${here ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-silver-500"}`} />
              </span>
            );
          })}
        </div>

        {isCommissioner ? (
          <div className="mt-7">
            <p className="text-sm text-silver-500">
              {hereCount} of {humans.length} {humans.length === 1 ? "member is" : "members are"} here. Opening randomizes the order and starts the first{" "}
              {league.pick_seconds}-second clock.
            </p>
            <button onClick={open} disabled={pending || !canOpen} className="btn-gold mt-4 flex-col gap-0 px-7 py-3.5 text-base">
              {pending ? "Opening…" : "Open the draft room"}
              <small className="block text-xs font-normal opacity-80">starts the clock immediately</small>
            </button>
            {!canOpen && (
              <p className="mt-2 text-xs text-gold-300">
                {members.length < 2 ? "Need at least 2 members signed in." : "Not enough active couples for this roster size."}
              </p>
            )}
            {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
            <div className="mt-3">
              <Link href="/admin#schedule" className="btn-ghost px-4 py-2 text-sm">
                {target ? "Change the start time" : "Set the start time"}
              </Link>
            </div>
          </div>
        ) : (
          <p className={`mt-7 text-sm ${late ? "animate-pulse text-gold-300" : "text-silver-500"}`}>
            {late ? "Any moment now… waiting on the commissioner to open the room." : "The commissioner opens the room when everyone's here. This page updates on its own."}
          </p>
        )}
      </section>
    </div>
  );
}

function Unit({ v, label }: { v: string; label: string }) {
  return (
    <div className="grid justify-items-center gap-1.5">
      <b className="lobby-digit">{v}</b>
      <small className="text-[11px] uppercase tracking-[0.18em] text-silver-500">{label}</small>
    </div>
  );
}
function Colon() {
  return <span className="lobby-colon">:</span>;
}

function Lane({ items, dir, reflect = false }: { items: Couple[]; dir: "left" | "right"; reflect?: boolean }) {
  const all = [...items, ...items];
  return (
    <div className={`lobby-lane ${dir === "right" ? "[animation-direction:reverse] [animation-duration:85s]" : ""} ${reflect ? "scale-y-[-1] blur-[1.5px]" : ""}`}>
      {all.map((c, i) => (
        <figure key={`${c.id}-${i}`} className={`lobby-poster ${i % 2 ? "mt-3.5 rotate-[1.1deg]" : "-rotate-[1.2deg]"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.image_url!} alt="" referrerPolicy="no-referrer" />
          <figcaption>
            <b>{c.celebrity}</b>
            <small>&amp; {c.professional}</small>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
