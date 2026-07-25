/** Pure CSV helpers — safe to import in client components (no server deps). */

export function parseCsvRaw(text: string): { headers: string[]; rows: string[][] } {
  const all: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { cur.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = ""; all.push(cur); cur = [];
    } else field += ch;
  }
  if (field.length || cur.length) { cur.push(field); all.push(cur); }
  const nonEmpty = all.filter((r) => r.some((c) => c.trim()));
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim());
  return { headers, rows: nonEmpty };
}

export interface ColumnMapping {
  email?: number;
  phone?: number;
  firstName?: number;
  lastName?: number;
}

export function guessMapping(headers: string[]): ColumnMapping {
  const find = (keys: string[]) => {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase().trim();
      if (keys.some((k) => h === k || h.includes(k))) return i;
    }
    return undefined;
  };
  return {
    email: find(["email", "e-mail"]),
    phone: find(["phone", "mobile", "cell"]),
    firstName: find(["first name", "firstname", "first", "given"]),
    lastName: find(["last name", "lastname", "last", "surname"]),
  };
}

export interface MappedRow {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, string>;
}

export function applyMapping(rows: string[][], m: ColumnMapping): MappedRow[] {
  const at = (r: string[], idx?: number) => (idx == null ? undefined : (r[idx] ?? "").trim() || undefined);
  return rows.map((r) => ({
    email: at(r, m.email),
    phone: at(r, m.phone),
    firstName: at(r, m.firstName),
    lastName: at(r, m.lastName),
  }));
}

/**
 * Map-all-columns model: `dest[i]` is what column i becomes — a core field
 * ("email"|"phone"|"firstName"|"lastName"), a GHL custom field ("cf:<key>"),
 * or null to ignore.
 */
const CORE = new Set(["email", "phone", "firstName", "lastName"]);

export function applyColumnDest(rows: string[][], dest: (string | null)[]): MappedRow[] {
  return rows.map((r) => {
    const out: MappedRow = {};
    const cf: Record<string, string> = {};
    dest.forEach((d, i) => {
      if (!d) return;
      const v = (r[i] ?? "").trim();
      if (!v) return;
      if (CORE.has(d)) (out as Record<string, string>)[d] = v;
      else if (d.startsWith("cf:")) cf[d.slice(3)] = v;
    });
    if (Object.keys(cf).length) out.customFields = cf;
    return out;
  });
}

/** Seed the per-column destinations from the header auto-guess. */
export function initialDest(headers: string[]): (string | null)[] {
  const g = guessMapping(headers);
  const dest: (string | null)[] = headers.map(() => null);
  if (g.email != null) dest[g.email] = "email";
  if (g.phone != null) dest[g.phone] = "phone";
  if (g.firstName != null) dest[g.firstName] = "firstName";
  if (g.lastName != null) dest[g.lastName] = "lastName";
  return dest;
}
