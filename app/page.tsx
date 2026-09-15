import Link from "next/link";
import { redirect } from "next/navigation";
import { Link2, Sparkles, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/supabase/auth";
import { Mirrorball } from "@/components/mirrorball";
import { BRAND, TAGLINE, SHOW_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** Signed out: the landing page. Signed in: straight to My Leagues. */
export default async function Home() {
  const supabase = await createClient();
  if (await sessionUser(supabase)) redirect("/leagues");

  const [first, ...rest] = BRAND.split(" ");
  const steps = [
    {
      icon: Link2,
      title: "Start a league, share one link",
      body: "Pick how many friends are playing, name it, and send the link to the group chat. Everyone signs in with Google and takes a seat.",
    },
    {
      icon: Sparkles,
      title: "Draft night",
      body: `A live snake draft with a pick clock. Every couple from this season of ${SHOW_NAME} is on the board.`,
    },
    {
      icon: Trophy,
      title: "Survive the ballroom",
      body: "Score a point for every week your couples survive. Lose one, claim a replacement from the Leftovers. Whoever holds the Mirrorball winner takes the crown.",
    },
  ];

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <header className="flex items-center justify-between py-4">
        <span className="flex items-center gap-2.5">
          <Mirrorball size={28} />
          <span className="display text-lg font-semibold italic tracking-tight">
            <span className="gold-text">{BRAND}</span>
          </span>
        </span>
        <Link href="/login" className="btn-ghost px-4 py-1.5 text-sm">
          Log in
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <div className="fade-up">
          <Mirrorball size={128} className="mx-auto drop-shadow-[0_24px_50px_rgb(233_194_80/0.35)]" />
        </div>
        <div className="stagger mt-8">
          <div className="eyebrow">Fantasy for {SHOW_NAME}</div>
          <h1 className="display mt-2 text-[clamp(40px,10vw,68px)] font-semibold italic leading-[1.0] tracking-tight [text-wrap:balance]">
            <span className="text-silver-100">{first}</span>
            <br />
            <span className="gold-text">{rest.join(" ")}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg text-silver-300">{TAGLINE}</p>
          <p className="mx-auto mt-3 max-w-md text-sm text-silver-500">
            A private fantasy league for you and your friends. Draft the couples, sweat every elimination, and settle who really knows ballroom.
          </p>
        </div>
        <div className="fade-up mt-9 w-full max-w-xs" style={{ animationDelay: "240ms" }}>
          <Link href="/login?start=1" className="btn-gold w-full py-3.5 text-base">
            Get Started
          </Link>
          <p className="mt-3 text-sm text-silver-500">
            Already have an account?{" "}
            <Link href="/login" className="text-gold-300 underline decoration-gold-400/50 hover:text-gold-200">
              Log in here
            </Link>
          </p>
        </div>
      </section>

      <section className="stagger grid gap-3 pb-10 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="glass p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400/15 text-gold-300">
                <s.icon size={16} />
              </span>
              <span className="eyebrow">Step {i + 1}</span>
            </div>
            <div className="display mt-3 text-lg font-semibold leading-tight text-silver-100">{s.title}</div>
            <p className="mt-1.5 text-sm text-silver-300">{s.body}</p>
          </div>
        ))}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t hairline py-5 text-xs text-silver-500">
        <span>Free to play · Google sign-in · built for phones on Tuesday nights</span>
        <span>
          <Link href="/legal/privacy" className="hover:text-silver-300">
            Privacy
          </Link>
          {" · "}
          <Link href="/legal/terms" className="hover:text-silver-300">
            Terms
          </Link>
        </span>
      </footer>
    </main>
  );
}
