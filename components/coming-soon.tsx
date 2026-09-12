export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-6 rounded-xl border border-dashed border-zinc-800 p-6 text-center text-zinc-500">
        Arrives in Phase {phase}.
      </p>
    </>
  );
}
