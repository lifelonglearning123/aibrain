import type { Brief } from "@/lib/ai/brief";

export function BriefView({ brief }: { brief: Brief }) {
  return (
    <div className="space-y-5">
      {brief.headline && (
        <div className="rounded-xl border border-slate-900 bg-slate-900 p-5 text-white">
          <div className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
            Today
          </div>
          <p className="mt-1 text-lg font-semibold leading-snug">{brief.headline}</p>
        </div>
      )}

      {brief.needsAttention.length > 0 && (
        <Section title="Needs your attention" accent="#ef4444">
          <ul className="space-y-1.5">
            {brief.needsAttention.map((x, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-red-500">•</span>
                {x}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {brief.brands.length > 0 && (
        <Section title="By brand" accent="#2563eb">
          <div className="grid gap-3 sm:grid-cols-3">
            {brief.brands.map((b, i) => (
              <div key={i} className="rounded-lg border border-slate-100 p-3">
                <div className="text-sm font-semibold text-slate-800">{b.name}</div>
                <div className="mt-1 text-xs text-slate-500">{b.snapshot}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {brief.voiceOfCustomer.length > 0 && (
        <Section title="What customers are saying" accent="#8b5cf6">
          <ul className="space-y-1.5">
            {brief.voiceOfCustomer.map((x, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-violet-500">•</span>
                {x}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {brief.todayFocus.length > 0 && (
        <Section title="Suggested focus today" accent="#10b981">
          <ul className="space-y-1.5">
            {brief.todayFocus.map((x, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-emerald-500">→</span>
                {x}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      </div>
      {children}
    </div>
  );
}
