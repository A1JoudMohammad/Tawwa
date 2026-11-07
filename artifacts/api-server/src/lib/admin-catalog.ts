import { connection } from "./catalog";

export class AdminError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// The same non-privileged key as the public catalog. All staff requests carry
// the user's JWT; Supabase RLS remains the final authorization boundary.
export async function supabase(path: string, token?: string, init: RequestInit = {}) {
  let config: ReturnType<typeof connection>;
  try { config = connection(); } catch {
    throw new AdminError(503, "Staff access is not configured. Connect the Supabase catalog first.");
  }
  try {
    return await fetch(new URL(path, config.url), {
      ...init,
      headers: { apikey: config.key, ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new AdminError(503, "Supabase is temporarily unavailable. Please try again."); }
}

export async function requireStaff(token: string | undefined) {
  if (!token) throw new AdminError(401, "Please sign in to your staff account.");
  const userResponse = await supabase("/auth/v1/user", token);
  if (!userResponse.ok) {
    if (userResponse.status >= 500) throw new AdminError(503, "Sign-in is temporarily unavailable.");
    throw new AdminError(401, "Your session has expired. Please sign in again.");
  }
  const user = await userResponse.json() as { id?: string };
  if (!user.id) throw new AdminError(401, "Please sign in again.");
  const response = await supabase(`/rest/v1/tawwa_staff?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`, token);
  if (!response.ok) throw new AdminError(503, "Staff permissions are not configured or are temporarily unavailable.");
  const rows = await response.json() as { user_id: string }[];
  if (!Array.isArray(rows) || !rows.some(row => row.user_id === user.id)) {
    throw new AdminError(403, "This account is not authorized to edit the catalog. Ask the store owner for staff access.");
  }
  return token;
}

export async function adminRows(table: string, token: string, select: string) {
  const response = await supabase(`/rest/v1/${table}?select=${select}&order=display_order.asc,id.asc`, token);
  if (!response.ok) throw new AdminError(503, "The staff catalog could not be loaded. Check that the staff migration has been applied.");
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new AdminError(503, "The staff catalog returned an invalid response.");
  return rows;
}

export const productFields = "id,occasion_id,age_group,name_en,name_ar,description_en,description_ar,contents_en,contents_ar,price,ideal_for_en,ideal_for_ar,delivery_en,delivery_ar,is_available,display_order";
export const occasionFields = "id,name_en,name_ar,icon,is_active,display_order";

// Trim at the API boundary, including array entries. Do not silently coerce a
// string price, boolean, or missing required field into a valid catalog record.
export function trimInput(input: unknown): unknown {
  if (typeof input === "string") return input.trim();
  if (Array.isArray(input)) return input.map(trimInput);
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, trimInput(value)]));
  return input;
}

export function validPrice(price: number) {
  return Number.isFinite(price) && price > 0 && price <= 1_000_000 &&
    Math.abs(price * 1000 - Math.round(price * 1000)) < 0.000001;
}

export async function saveRecord(table: string, token: string, data: { id: string }, update: boolean, fields: string) {
  const path = `/rest/v1/${table}?select=${fields}${update ? `&id=eq.${encodeURIComponent(data.id)}` : ""}`;
  const response = await supabase(path, token, {
    method: update ? "PATCH" : "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { code?: string };
    if (detail.code === "23505") throw new AdminError(409, "That ID already exists. Choose a different ID.");
    if (detail.code === "23503") throw new AdminError(400, "Choose an existing occasion.");
    if (detail.code === "23514" || detail.code === "P0001") throw new AdminError(400, "The record failed catalog validation. Check the bilingual text, price and occasion.");
    if (response.status === 401) throw new AdminError(401, "Your session has expired. Please sign in again.");
    if (response.status === 403) throw new AdminError(403, "Staff write access was denied.");
    throw new AdminError(503, "The change could not be saved. Please try again.");
  }
  const rows = await response.json() as unknown[];
  if (!Array.isArray(rows) || !rows[0]) throw new AdminError(404, "This record no longer exists. Reload the catalog.");
  return rows[0];
}
