import assert from "node:assert/strict";
import { test, after } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["src/lib/catalog.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { readCatalog } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
after(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
  else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
});

const product = {
  id: "live-box", occasion_id: "live-occasion", age_group: null,
  name_en: "Live gift", name_ar: "هدية", description_en: "From the database",
  description_ar: "من قاعدة البيانات", contents_en: ["A card"], contents_ar: ["بطاقة"],
  price: 19.125, ideal_for_en: "Everyone", ideal_for_ar: "للجميع",
  delivery_en: "Tonight", delivery_ar: "الليلة",
};
const occasions = [
  { id: "live-occasion", name_en: "Live occasion", name_ar: "مناسبة", icon: "gift" },
  { id: "empty-occasion", name_en: "Not available", name_ar: "غير متاح", icon: "sun" },
];
function setup(overrides = {}) {
  process.env.SUPABASE_URL = "https://catalog.example";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_unit_test";
  const calls = [];
  const tables = {
    tawwa_products: [product],
    tawwa_occasions: occasions,
    tawwa_governorates: [{ id: "area", name_en: "Database governorate" }],
    ...overrides,
  };
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    return new Response(JSON.stringify(tables[url.pathname.split("/").pop()]), {
      headers: { "content-type": "application/json" },
    });
  };
  return calls;
}

test("maps live bilingual fields, decimal prices, optional ages and governorates", async () => {
  const calls = setup();
  const catalog = await readCatalog();
  assert.equal(catalog.products[0].name, product.name_en);
  assert.equal(catalog.products[0].ar, product.name_ar);
  assert.equal(catalog.products[0].descriptionAr, product.description_ar);
  assert.deepEqual(catalog.products[0].contentsAr, product.contents_ar);
  assert.equal(catalog.products[0].price, 19.125);
  assert.equal(catalog.products[0].age, undefined);
  assert.deepEqual(catalog.governorates, ["Database governorate"]);
  assert.deepEqual(catalog.occasions.map(row => row.id), ["live-occasion"]);
  assert.equal(calls.length, 3);
  assert(calls.every(({ url }) => url.searchParams.get("order") === "display_order.asc,id.asc"));
  assert(calls.every(({ options }) => options.headers.apikey === "sb_publishable_unit_test"));
  const productsCall = calls.find(({ url }) => url.pathname.endsWith("tawwa_products"));
  assert.equal(productsCall.url.searchParams.get("is_available"), "eq.true");
});

test("keeps database ordering, and age groups when provided", async () => {
  setup({ tawwa_products: [{ ...product, id: "second-alphabetically", age_group: "3-6" }, { ...product, id: "a-first" }] });
  const catalog = await readCatalog();
  assert.deepEqual(catalog.products.map(row => row.id), ["second-alphabetically", "a-first"]);
  assert.equal(catalog.products[0].age, "3-6");
});

test("an empty catalog never falls back to bundled products or occasions", async () => {
  setup({ tawwa_products: [] });
  const catalog = await readCatalog();
  assert.deepEqual(catalog.products, []);
  assert.deepEqual(catalog.occasions, []);
});

test("upstream failures and malformed rows fail explicitly", async () => {
  setup();
  globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
  await assert.rejects(readCatalog(), /request failed/);
  setup({ tawwa_products: [{ ...product, price: "not-a-number" }] });
  await assert.rejects(readCatalog());
});

test("missing configuration or privileged keys are never accepted", async () => {
  setup();
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  await assert.rejects(readCatalog(), /configuration is missing/);
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_secret_not_a_real_key";
  await assert.rejects(readCatalog(), /publishable key/);
});
