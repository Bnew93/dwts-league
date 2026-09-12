export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <h1 className="display text-3xl font-semibold">{title}</h1>
      <p className="glass mt-6 border-dashed p-8 text-center text-silver-500">Arrives in Phase {phase}.</p>
    </>
  );
}
