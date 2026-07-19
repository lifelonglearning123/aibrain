"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const SECTIONS: {
  title: string;
  items: { href: string; label: string }[];
  ownerOnly?: boolean;
}[] = [
  {
    title: "See",
    items: [
      { href: "/dashboard/pipeline", label: "Pipeline" },
      { href: "/dashboard/revenue", label: "Revenue" },
      { href: "/dashboard/marketing", label: "Marketing" },
    ],
  },
  {
    title: "Do",
    items: [
      { href: "/dashboard/retargeting", label: "Retargeting" },
      { href: "/dashboard/social", label: "Social" },
      { href: "/dashboard/video", label: "Video" },
      { href: "/dashboard/media", label: "Media library" },
    ],
  },
  {
    title: "Think",
    items: [
      { href: "/dashboard/ask", label: "Ask your data" },
      { href: "/dashboard/insights", label: "AI Insights" },
      { href: "/dashboard/context", label: "Business context" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/dashboard/team", label: "Team & access" },
      { href: "/dashboard/settings", label: "Settings" },
      { href: "/dashboard/apps", label: "Connected apps" },
    ],
    ownerOnly: true,
  },
];

export function Sidebar({ isOwner = true }: { isOwner?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const sections = SECTIONS.filter((s) => !s.ownerOnly || isOwner);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 p-4 text-slate-300 md:flex">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-slate-900">
          AI
        </div>
        <span className="text-sm font-semibold text-white">AI Brain</span>
      </div>

      <nav className="flex flex-1 flex-col gap-5">
        <Link
          href={qs ? `/dashboard?${qs}` : "/dashboard"}
          className={`rounded-lg px-3 py-2 text-sm transition ${
            pathname === "/dashboard"
              ? "bg-slate-800 font-medium text-white"
              : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
          }`}
        >
          ★ Daily Brief
        </Link>

        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              {section.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={qs ? `${item.href}?${qs}` : item.href}
                    className={`rounded-lg px-3 py-2 text-sm transition ${
                      active
                        ? "bg-slate-800 font-medium text-white"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-slate-800 px-2 pt-4 text-xs text-slate-500">
        Command center · v0.2
      </div>
    </aside>
  );
}
