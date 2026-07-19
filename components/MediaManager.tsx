"use client";

import { useState } from "react";
import { ENTITIES, type EntityKey } from "@/lib/entities";
import { MediaLibrary } from "./MediaLibrary";

/** The Media page body: a brand selector over the shared media library. */
export function MediaManager({
  initialEntity,
  allowedBrands,
}: {
  initialEntity: EntityKey;
  allowedBrands: EntityKey[];
}) {
  const [brand, setBrand] = useState<EntityKey>(initialEntity);
  const brandOptions = ENTITIES.filter((e) => allowedBrands.includes(e.key));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-medium text-slate-700">Brand</label>
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value as EntityKey)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          {brandOptions.map((e) => (
            <option key={e.key} value={e.key}>
              {e.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400">
          Videos here are available to use in Social and Video for this brand.
        </span>
      </div>
      <MediaLibrary entity={brand} accept="video/*,image/*" />
    </div>
  );
}
