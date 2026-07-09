export type EntityKey = "macaws" | "artificial-ignorance" | "leonardo";

export interface Entity {
  key: EntityKey;
  name: string;
  /** hex accent used across the dashboard */
  color: string;
}

/** The three brands the AI Brain covers. Mirrors supabase/seed.sql. */
export const ENTITIES: Entity[] = [
  { key: "macaws", name: "macaws.ai", color: "#2563eb" },
  { key: "artificial-ignorance", name: "Artificial Ignorance", color: "#10b981" },
  { key: "leonardo", name: "Leonardo", color: "#f59e0b" },
];

export const ALL = "all" as const;
export type EntityFilter = EntityKey | typeof ALL;

export function resolveEntity(value?: string | null): EntityFilter {
  if (!value || value === ALL) return ALL;
  return ENTITIES.some((e) => e.key === value) ? (value as EntityKey) : ALL;
}

export function entityLabel(filter: EntityFilter): string {
  if (filter === ALL) return "All brands";
  return ENTITIES.find((e) => e.key === filter)?.name ?? "All brands";
}
