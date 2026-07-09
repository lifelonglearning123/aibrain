export function EmptyState({
  source,
  phase,
  children,
}: {
  source: string;
  phase: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        ○
      </div>
      <h3 className="text-sm font-semibold text-slate-700">
        {source} not connected yet
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {children ??
          `This view comes to life once ${source} is wired up. Scheduled in ${phase}.`}
      </p>
      <span className="mt-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
        {phase}
      </span>
    </div>
  );
}
