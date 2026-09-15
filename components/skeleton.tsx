/** Instant placeholder while a page's data loads. Matches the page title block plus a few cards. */
export function PageSkeleton({ rows = 4, wide = false }: { rows?: number; wide?: boolean }) {
  return (
    <main className={`mx-auto w-full ${wide ? "max-w-5xl" : "max-w-3xl"} animate-pulse px-4 pb-24 pt-5 sm:pb-10`} aria-busy="true" aria-label="Loading">
      <div className="h-3 w-24 rounded bg-plum-700/50" />
      <div className="mt-3 h-8 w-48 rounded bg-plum-700/60" />
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-[76px] rounded-2xl border hairline bg-plum-900/40" />
        ))}
      </div>
    </main>
  );
}
