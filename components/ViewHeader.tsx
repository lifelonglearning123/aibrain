import { entityLabel, resolveEntity } from "@/lib/entities";

export function ViewHeader({
  title,
  subtitle,
  entity,
}: {
  title: string;
  subtitle: string;
  entity?: string;
}) {
  const filter = resolveEntity(entity);
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
      </div>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
        {entityLabel(filter)}
      </span>
    </div>
  );
}
