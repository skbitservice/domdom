/** Honest stand-in for sections that are scheduled for a later step. */
export function Placeholder({ title, step }: { title: string; step: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-6 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        This section is built in <span className="font-medium">{step}</span>.
        Navigation and layout are in place now so the structure is ready.
      </div>
    </div>
  );
}
