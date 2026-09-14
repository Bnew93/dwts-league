import Link from "next/link";
import { Mirrorball } from "@/components/mirrorball";
import { BRAND, LEGAL_ENTITY } from "@/lib/brand";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
      <Link href="/" className="flex items-center gap-2.5">
        <Mirrorball size={28} />
        <span className="display text-lg font-semibold italic tracking-tight">
          <span className="gold-text">{BRAND}</span>
        </span>
      </Link>
      <article className="prose-invert mt-8 space-y-4 text-[15px] leading-relaxed text-silver-300 [&_h1]:display [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-silver-100 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-silver-100 [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </article>
      <footer className="mt-12 border-t hairline pt-4 text-xs text-silver-500">
        {LEGAL_ENTITY} ·{" "}
        <Link href="/legal/privacy" className="hover:text-silver-300">
          Privacy
        </Link>
        {" · "}
        <Link href="/legal/terms" className="hover:text-silver-300">
          Terms
        </Link>
      </footer>
    </main>
  );
}
