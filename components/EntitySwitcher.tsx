"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ALL, ENTITIES, type EntityKey } from "@/lib/entities";

export function EntitySwitcher({ brands }: { brands: EntityKey[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("entity") ?? ALL;

  function select(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === ALL) params.delete("entity");
    else params.set("entity", key);
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  const allowed = ENTITIES.filter((e) => brands.includes(e.key));
  // Only offer "All brands" when there's more than one to switch between.
  const options =
    allowed.length > 1
      ? [{ key: ALL, name: "All brands", color: "#64748b" }, ...allowed]
      : allowed;

  if (options.length === 0) return <div />;

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
      {options.map((o) => {
        const active = current === o.key || options.length === 1;
        return (
          <button
            key={o.key}
            onClick={() => select(o.key)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: o.color }}
            />
            {o.name}
          </button>
        );
      })}
    </div>
  );
}
