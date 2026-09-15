import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getCtx } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";
import { Shell, PageTitle, SectionTitle } from "@/components/shell";
import { CoupleFace } from "@/components/couple";
import { StatusChip } from "@/components/status-chip";
import { ShareLink } from "@/components/share-link";
import { ConfirmForm } from "@/components/confirm-form";
import { StartDraftButton } from "@/components/draft/start-draft-button";
import { LeagueStatusChip } from "@/components/league-status";
import { loadSeason, currentOwners, weekInfo } from "@/lib/queries";
import { rosterMath } from "@/lib/draft";
import { inviteUrl } from "@/lib/url";
import type { Invite } from "@/lib/types";
import {
  saveSettings,
  saveSchedule,
  regenerateInvite,
  revokeInvite,
  removeMember,
  transferCommissioner,
  deleteLeague,
  endMockDraft,
  resetDraft,
  overrideResult,
  voidClaim,
  moveClaim,
} from "./actions";

export const dynamic = "force-dynamic";

const TABS = ["members", "settings", "draft", "results", "claims", "more"] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { members: "Members", settings: "Settings", draft: "Draft", results: "Results", claims: "Claims", more: "Transfer & delete" };
const sel = "input-dark w-auto px-2 py-1.5 text-sm";

export default async function CommissionerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab: rawTab } = await searchParams;
  const ctx = await getCtx(slug);
  if (!ctx.isCommissioner) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "members";
  const { league, members, players } = ctx;
  const setup = league.status === "setup";
  const drafted = league.status === "active" || league.status === "complete";

  const supabase = await createClient();
  const [{ data: inviteRow }, season] = await Promise.all([
    supabase.from("league_invites").select("*").eq("league_id", league.id).is("revoked_at", null).maybeSingle(),
    loadSeason(league),
  ]);
  const invite = inviteRow as Invite | null;
  const { couples, events, episodes, claims } = season;
  const owners = currentOwners(events);
  const { weeks, aired, current } = weekInfo(episodes);
  const activeCount = couples.filter((c) => c.status === "active").length;
  const math = rosterMath(activeCount, players.length);
  const nameOf = (id?: string | null) => (id ? members.find((m) => m.id === id)?.display_name ?? "—" : "Leftovers");
  const seats = Array.from({ length: Math.max(league.member_cap, members.length) }, (_, i) => members[i] ?? null);

  return (
    <Shell ctx={ctx}>
      <PageTitle eyebrow="Commissioner" title={league.name} meta={<LeagueStatusChip status={league.status} />} />

      <nav className="-mx-4 mt-4 flex gap-1 overflow-x-auto px-4 text-sm">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/l/${slug}/commissioner?tab=${t}`}
            className={`shrink-0 rounded-full px-3 py-1.5 transition-colors ${tab === t ? "bg-gold-400 text-plum-950" : "border hairline text-silver-300 hover:text-silver-100"}`}
          >
            {LABEL[t]}
            {t === "claims" && claims.some((c) => c.status === "pending") && <span className="ml-1 text-xs">·</span>}
          </Link>
        ))}
      </nav>

      <div className="stagger mt-5 space-y-4">
        {tab === "members" && (
          <>
            <section className="glass p-4">
              <SectionTitle right={`${members.length} of ${league.member_cap} joined`}>Seats</SectionTitle>
              <div className="flex flex-wrap gap-1.5" aria-label={`${members.length} of ${league.member_cap} seats filled`}>
                {seats.map((m, i) => (
                  <span
                    key={m?.id ?? `open-${i}`}
                    title={m ? m.display_name : "open seat"}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
                      m ? "bg-gold-400 text-plum-950 shadow-[0_0_10px_rgb(233_194_80/.6)]" : "border border-dashed border-silver-500/40 text-silver-500"
                    }`}
                  >
                    {m ? m.display_name.slice(0, 1) : "·"}
                  </span>
                ))}
              </div>
              <ul className="mt-4 divide-y divide-gold-400/10 text-sm">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-silver-100">
                        {m.display_name}
                        {m.id === ctx.user.id && <span className="ml-1.5 rounded-full bg-gold-400/15 px-1.5 text-[10px] text-gold-300">you</span>}
                        {m.is_mock && <span className="ml-1.5 text-xs text-gold-400/80">proxy</span>}
                      </div>
                      <div className="text-xs text-silver-500">
                        {m.role === "commissioner" ? "Commissioner" : "Member"}
                        {!m.is_player && " · not drafting"} · joined {new Date(m.joined_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    </div>
                    {m.role !== "commissioner" && league.status !== "drafting" && (
                      <ConfirmForm
                        action={removeMember}
                        message={
                          setup
                            ? `Remove ${m.display_name}? Their seat reopens.`
                            : `Remove ${m.display_name} from the league? Their couples return to the Leftovers pool. This cannot be undone.`
                        }
                      >
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="user_id" value={m.id} />
                        <button className="text-xs text-silver-500 underline hover:text-rose-300">remove</button>
                      </ConfirmForm>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="glass p-4">
              <SectionTitle right={invite ? `${invite.use_count} use${invite.use_count === 1 ? "" : "s"}` : undefined}>Invite link</SectionTitle>
              {!setup ? (
                <p className="text-sm text-silver-500">Invites closed when the draft started.</p>
              ) : invite ? (
                <>
                  <p className="text-sm text-silver-300">Anyone who follows this link and signs in with Google takes a seat, until the league is full.</p>
                  <ShareLink leagueName={league.name} url={inviteUrl(invite.token)} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ConfirmForm action={regenerateInvite} message="Regenerate the link? The current one stops working.">
                      <input type="hidden" name="slug" value={slug} />
                      <button className="btn-ghost text-sm">Regenerate</button>
                    </ConfirmForm>
                    <ConfirmForm action={revokeInvite} message="Revoke the link? No one can join until you create a new one.">
                      <input type="hidden" name="slug" value={slug} />
                      <button className="btn-ghost text-sm text-rose-200">Revoke</button>
                    </ConfirmForm>
                  </div>
                </>
              ) : (
                <form action={regenerateInvite}>
                  <p className="text-sm text-silver-300">No active link. Create one to open the doors.</p>
                  <input type="hidden" name="slug" value={slug} />
                  <button className="btn-gold mt-3">Create invite link</button>
                </form>
              )}
            </section>
          </>
        )}

        {tab === "settings" && (
          <>
            <section className="glass p-4">
              <SectionTitle>League</SectionTitle>
              <form action={saveSettings} className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="slug" value={slug} />
                <label className="text-sm text-silver-300 sm:col-span-3">
                  League name
                  <input name="name" defaultValue={league.name} maxLength={60} className="input-dark mt-1" disabled={!setup} />
                </label>
                <label className="text-sm text-silver-300">
                  Seats (2–14)
                  <input name="member_cap" type="number" min={Math.max(2, members.length)} max={14} defaultValue={league.member_cap} className="input-dark mt-1" disabled={!setup} />
                </label>
                <label className="text-sm text-silver-300">
                  Pick timer (seconds)
                  <input name="pick_seconds" type="number" min={15} max={600} defaultValue={league.pick_seconds} className="input-dark mt-1" disabled={!setup} />
                </label>
                <div className="flex items-end">
                  <button className="btn-gold" disabled={!setup}>
                    Save
                  </button>
                </div>
              </form>
              <p className="mt-2 text-xs text-silver-500">
                {setup
                  ? `With ${players.length} player${players.length === 1 ? "" : "s"} today each drafts ${math.rosterSize}; the roster size is fixed from the player count when the draft starts.`
                  : "Name, seats, and the pick timer locked when the draft started."}
              </p>
            </section>

            <section className="glass p-4" id="schedule">
              <SectionTitle>Draft night</SectionTitle>
              <p className="text-sm text-silver-300">Estimated start, shown as a countdown in the lobby. Nothing starts automatically; you open the room when everyone&apos;s there.</p>
              <form action={saveSchedule} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="slug" value={slug} />
                <label className="text-sm text-silver-300">
                  Start (Eastern)
                  <input
                    name="scheduled"
                    type="datetime-local"
                    defaultValue={league.draft_scheduled_at ? formatInTimeZone(new Date(league.draft_scheduled_at), "America/New_York", "yyyy-MM-dd'T'HH:mm") : ""}
                    className="input-dark mt-1 w-auto"
                  />
                </label>
                <button className="btn-gold">Save</button>
                {league.draft_scheduled_at && (
                  <span className="text-xs text-silver-500">Currently {formatInTimeZone(new Date(league.draft_scheduled_at), "America/New_York", "EEE, MMM d · h:mm a")} ET</span>
                )}
              </form>
            </section>
          </>
        )}

        {tab === "draft" && (
          <section className="glass border-gold-400/35 p-4">
            <SectionTitle>Draft</SectionTitle>
            <p className="text-sm text-silver-300">
              {players.length} drafter{players.length === 1 ? "" : "s"} × {setup ? math.rosterSize : league.roster_size} rounds ={" "}
              {players.length * (setup ? math.rosterSize : league.roster_size)} picks from {activeCount} couples → {setup ? math.leftovers : activeCount - players.length * league.roster_size}{" "}
              leftover{(setup ? math.leftovers : 1) === 1 ? "" : "s"}
              {setup && math.leftovers === 0 && " (replacement picks disabled)"}.
            </p>
            {league.is_mock && (
              <p className="mt-3 rounded-lg border border-gold-400/40 bg-gold-400/10 px-3 py-2 text-sm text-gold-200">
                This league is in mock-draft mode: proxy players hold seats and nothing counts. End it to clear the proxies and every pick, then start the real draft.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-start gap-2.5">
              {setup && !league.is_mock && (
                <StartDraftButton leagueId={league.id} slug={slug} players={players.length} cap={league.member_cap} coupleCount={activeCount} disabled={players.length < 2 || math.rosterSize < 1} label="Start draft" />
              )}
              {league.status === "drafting" && (
                <Link href={`/l/${slug}/draft`} className="btn-gold">
                  Open draft room
                </Link>
              )}
              {league.status === "drafting" && !league.is_mock && (
                <ConfirmForm action={resetDraft} message="Reset the draft? Every pick so far is discarded and the league returns to setup.">
                  <input type="hidden" name="slug" value={slug} />
                  <button className="btn-danger">Reset draft</button>
                </ConfirmForm>
              )}
              {league.is_mock && (
                <ConfirmForm action={endMockDraft} message="End the mock draft and remove the proxies?">
                  <input type="hidden" name="slug" value={slug} />
                  <button className="btn-danger">End mock draft</button>
                </ConfirmForm>
              )}
              {drafted && <p className="text-sm text-silver-500">The draft is complete{league.draft_completed_at && ` · ${new Date(league.draft_completed_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`}.</p>}
            </div>
            {league.draft_order && (
              <ol className="mt-4 flex flex-wrap gap-2 text-sm">
                {league.draft_order.map((id, i) => {
                  const m = members.find((m) => m.id === id);
                  return (
                    <li key={id} className="rounded-full border hairline bg-plum-950/50 px-3 py-1 text-silver-300">
                      <span className="text-gold-300">{i + 1}.</span> {m?.display_name ?? "departed"}
                      {m?.is_mock && <span className="ml-1 text-xs text-gold-400/80">proxy</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}

        {tab === "results" && (
          <>
            <section className="glass p-4">
              <SectionTitle>League-scoped overrides</SectionTitle>
              <p className="text-sm text-silver-300">
                Official results come from the show and apply to every league at once. Use this only to fix your league&apos;s rosters: pull a couple off its owner&apos;s team (they get a
                replacement claim) or restore one. It never changes the couple&apos;s status on the show.
              </p>
              {!drafted && <p className="mt-3 rounded-lg border border-gold-400/40 bg-gold-400/10 px-3 py-2 text-sm text-gold-200">Nothing to override until the draft is complete.</p>}
            </section>
            {drafted && (
              <section>
                <SectionTitle right={`${couples.filter((c) => owners.has(c.id)).length} on rosters`}>Couples</SectionTitle>
                <ul className="space-y-2">
                  {couples.map((c) => {
                    const owner = owners.get(c.id);
                    const leagueOut = events.some((e) => e.couple_id === c.id && (e.event === "eliminated" || e.event === "withdrew"));
                    return (
                      <li key={c.id} className="glass p-3">
                        <div className="flex items-center gap-3">
                          <CoupleFace couple={c} size={40} ring="ring-gold-400/50" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-silver-100">
                              {c.celebrity} <span className="font-normal text-silver-500">&amp; {c.professional}</span>
                            </div>
                            <div className="text-xs text-silver-500">
                              {owner ? `on ${nameOf(owner)}'s roster` : leagueOut ? `off roster (was ${nameOf(events.filter((e) => e.couple_id === c.id).at(-1)?.user_id)})` : "Leftovers"}
                            </div>
                          </div>
                          <StatusChip couple={c} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {owner && (
                            <ConfirmForm action={overrideResult} message={`Pull ${c.celebrity} off ${nameOf(owner)}'s roster in this league?`} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="slug" value={slug} />
                              <input type="hidden" name="couple_id" value={c.id} />
                              <select name="event" className={sel} defaultValue="eliminated">
                                <option value="eliminated">Eliminated</option>
                                <option value="withdrew">Withdrew</option>
                              </select>
                              <select name="week" className={sel} defaultValue={aired.size ? Math.max(...aired) : current}>
                                {weeks.map((w) => (
                                  <option key={w} value={w}>
                                    wk {w}
                                  </option>
                                ))}
                              </select>
                              <button className="btn-ghost px-3 py-1.5 text-sm">Apply</button>
                            </ConfirmForm>
                          )}
                          {leagueOut && !owner && (
                            <ConfirmForm action={overrideResult} message={`Restore ${c.celebrity} to their last roster in this league?`}>
                              <input type="hidden" name="slug" value={slug} />
                              <input type="hidden" name="couple_id" value={c.id} />
                              <input type="hidden" name="event" value="restore" />
                              <button className="btn-ghost px-3 py-1.5 text-sm">Restore</button>
                            </ConfirmForm>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}

        {tab === "claims" && (
          <section className="glass p-4">
            <SectionTitle>Replacement claims</SectionTitle>
            {claims.length === 0 ? (
              <p className="text-sm text-silver-500">No claims yet. They appear when a rostered couple is eliminated.</p>
            ) : (
              <ul className="divide-y divide-gold-400/10 text-sm">
                {claims.map((cl, i) => {
                  const pendingList = claims.filter((c) => c.status === "pending");
                  const pi = pendingList.findIndex((c) => c.id === cl.id);
                  return (
                    <li key={cl.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 text-silver-300">
                        <span className="text-silver-500">#{cl.queue_pos}</span> {nameOf(cl.user_id)} lost {couples.find((c) => c.id === cl.lost_couple_id)?.celebrity}
                        <span className="ml-2 text-xs text-silver-500">
                          {cl.status}
                          {cl.picked_couple_id && ` → ${couples.find((c) => c.id === cl.picked_couple_id)?.celebrity}`}
                          {cl.status === "pending" && cl.deadline && ` · due ${new Date(cl.deadline).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric" })} ET`}
                        </span>
                      </span>
                      {cl.status === "pending" && (
                        <span className="flex shrink-0 items-center gap-1">
                          <form action={moveClaim}>
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="claim_id" value={cl.id} />
                            <input type="hidden" name="dir" value="up" />
                            <button disabled={pi <= 0} className="btn-ghost px-2 py-1 text-xs disabled:opacity-30" aria-label="Move up">
                              ↑
                            </button>
                          </form>
                          <form action={moveClaim}>
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="claim_id" value={cl.id} />
                            <input type="hidden" name="dir" value="down" />
                            <button disabled={pi >= pendingList.length - 1} className="btn-ghost px-2 py-1 text-xs disabled:opacity-30" aria-label="Move down">
                              ↓
                            </button>
                          </form>
                          <ConfirmForm action={voidClaim} message="Void this claim? The slot stays empty.">
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="claim_id" value={cl.id} />
                            <button className="btn-ghost px-2 py-1 text-xs text-rose-200">void</button>
                          </ConfirmForm>
                        </span>
                      )}
                      <span className="sr-only">{i}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {tab === "more" && (
          <>
            <section className="glass p-4">
              <SectionTitle>Transfer commissioner</SectionTitle>
              <p className="text-sm text-silver-300">Hand the league to another member. You stay in the league as a member.</p>
              {members.filter((m) => m.id !== ctx.user.id && !m.is_mock).length === 0 ? (
                <p className="mt-2 text-sm text-silver-500">No one else has joined yet.</p>
              ) : (
                <ConfirmForm action={transferCommissioner} message="Transfer the commissioner role? You will lose access to this page." className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="slug" value={slug} />
                  <select name="user_id" className={sel} required defaultValue="">
                    <option value="" disabled>
                      Choose a member
                    </option>
                    {members
                      .filter((m) => m.id !== ctx.user.id && !m.is_mock)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.display_name}
                        </option>
                      ))}
                  </select>
                  <button className="btn-ghost text-sm">Transfer</button>
                </ConfirmForm>
              )}
            </section>
            <section className="glass border-rose-500/30 p-4">
              <SectionTitle>Delete league</SectionTitle>
              {setup ? (
                <>
                  <p className="text-sm text-silver-300">Deletes the league, its seats, and its invite link. Only possible before the draft.</p>
                  <ConfirmForm action={deleteLeague} message={`Delete ${league.name}? This cannot be undone.`} className="mt-3">
                    <input type="hidden" name="slug" value={slug} />
                    <button className="btn-danger">Delete league</button>
                  </ConfirmForm>
                </>
              ) : (
                <p className="text-sm text-silver-500">A league that has drafted can&apos;t be deleted; its history is part of the season.</p>
              )}
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
