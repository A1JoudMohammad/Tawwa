import { GetCatalogResponse } from "@workspace/api-zod";

type Row = Record<string, unknown>;

// Only the public, RLS-constrained key is accepted. Never use a service-role key
// for a public catalog, even on the server.
export function connection() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase catalog configuration is missing");
  if (!key.startsWith("sb_publishable_")) {
    throw new Error("Catalog requires a Supabase publishable key");
  }
  return { url, key };
}

async function readRows(table: string, select: string, availableOnly = false): Promise<Row[]> {
  const { url, key } = connection();
  const endpoint = new URL(`/rest/v1/${table}`, url);
  endpoint.searchParams.set("select", select);
  endpoint.searchParams.set("order", "display_order.asc,id.asc");
  if (availableOnly) endpoint.searchParams.set("is_available", "eq.true");
  const response = await fetch(endpoint, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Supabase catalog request failed (${response.status})`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Invalid Supabase catalog response");
  return rows;
}

export async function readCatalog() {
  const [occasionRows, productRows, governorateRows] = await Promise.all([
    readRows("tawwa_occasions", "id,name_en,name_ar,icon"),
    readRows("tawwa_products", "id,occasion_id,age_group,name_en,name_ar,description_en,description_ar,contents_en,contents_ar,price,ideal_for_en,ideal_for_ar,delivery_en,delivery_ar", true),
    readRows("tawwa_governorates", "id,name_en"),
  ]);
  const products = productRows.map(row => ({
    id: row.id,
    occasion: row.occasion_id,
    ...(row.age_group == null ? {} : { age: row.age_group }),
    name: row.name_en,
    ar: row.name_ar,
    description: row.description_en,
    descriptionAr: row.description_ar,
    contents: row.contents_en,
    contentsAr: row.contents_ar,
    price: row.price,
    idealFor: row.ideal_for_en,
    idealForAr: row.ideal_for_ar,
    delivery: row.delivery_en,
    deliveryAr: row.delivery_ar,
  }));
  return GetCatalogResponse.parse({
    products,
    occasions: occasionRows
      .filter(row => products.some(product => product.occasion === row.id))
      .map(row => ({ id: row.id, name: row.name_en, ar: row.name_ar, icon: row.icon })),
    governorates: governorateRows.map(row => row.name_en),
  });
}
