import assert from "node:assert/strict";
import { test, after, beforeEach } from "node:test";
import Module from "node:module";
import { build } from "esbuild";
import express from "express";

// Bundle TypeScript in memory; no generated files or real external writes.
const { outputFiles } = await build({
  entryPoints: ["src/routes/admin.ts"], bundle: true, platform: "node",
  format: "cjs", write: false,
});
const bundled = new Module(`${process.cwd()}/tests/admin-bundle.cjs`);
bundled._compile(outputFiles[0].text, bundled.id);
const app = express();
app.use(express.json());
app.use("/api", (req, _res, next) => { req.log = { info() {}, error() {} }; next(); });
app.use("/api", bundled.exports.default);
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}/api/admin`;
const realFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
after(() => {
  server.close();
  globalThis.fetch = realFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
  else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
});
const occasion = { id: "birthday", name_en: "Birthday", name_ar: "عيد ميلاد", icon: "sparkles", is_active: true, display_order: 0 };
const product = {
  id: "test-gift", occasion_id: "birthday", age_group: null,
  name_en: "Test gift", name_ar: "هدية", description_en: "Description",
  description_ar: "الوصف", contents_en: ["Card"], contents_ar: ["بطاقة"],
  price: 12.125, ideal_for_en: "A friend", ideal_for_ar: "صديق",
  delivery_en: "Tomorrow", delivery_ar: "غداً", is_available: true, display_order: 0,
};
let calls, staff, upstreamStatus, saveStatus, occasions, saved, invalidToken;
beforeEach(() => {
  calls = []; staff = true; upstreamStatus = 200; saveStatus = 200;
  occasions = [{ ...occasion }]; saved = []; invalidToken = false;
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_only";
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname !== "supabase.test") return realFetch(input, options);
    calls.push({ url, options });
    const json = (data, status = upstreamStatus) => new Response(JSON.stringify(data), {
      status, headers: { "Content-Type": "application/json" },
    });
    if (url.pathname.endsWith("/token")) return json({ access_token: "test-jwt", expires_in: 3600 });
    if (url.pathname.endsWith("/user")) return json({ id: "staff-user" }, invalidToken ? 401 : upstreamStatus);
    if (url.pathname.endsWith("/logout")) return new Response(null, { status: 204 });
    if (url.pathname.endsWith("/tawwa_staff")) return json(staff ? [{ user_id: "staff-user" }] : []);
    if (options.method === "POST" || options.method === "PATCH") {
      if (saveStatus !== 200) return json({ code: saveStatus === 409 ? "23505" : "23514" }, saveStatus);
      const data = JSON.parse(options.body);
      saved.push(data);
      return json([data]);
    }
    if (url.pathname.endsWith("/tawwa_occasions")) return json(occasions);
    return json([product]);
  };
});

const request = (path, { method = "GET", body, cookie = "tawwa_staff=test-jwt", csrf = true, extraHeaders = {} } = {}) =>
  realFetch(base + path, {
    method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}),
      ...(csrf ? { "X-Tawwa-Admin": "1" } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test("anonymous requests cannot read private catalog or write either entity", async () => {
  for (const [path, method, body] of [
    ["/catalog", "GET"], ["/products", "POST", product], ["/products/test-gift", "PUT", product],
    ["/occasions", "POST", occasion], ["/occasions/birthday", "PUT", occasion],
  ]) {
    const response = await request(path, { method, body, cookie: "" });
    assert.equal(response.status, 401);
  }
  assert.equal(calls.length, 0);
});

test("ordinary accounts and expired tokens are denied on reads and writes", async () => {
  staff = false;
  assert.equal((await request("/catalog")).status, 403);
  assert.equal((await request("/products", { method: "POST", body: product })).status, 403);
  invalidToken = true;
  assert.equal((await request("/catalog")).status, 401);
  assert.equal(saved.length, 0);
});

test("CSRF gate rejects missing header and cross-site writes including login", async () => {
  const login = { email: "test@example.invalid", password: "test-only" };
  assert.equal((await request("/session", { method: "POST", body: login, csrf: false })).status, 403);
  assert.equal((await request("/products", {
    method: "POST", body: product, extraHeaders: { "sec-fetch-site": "cross-site" },
  })).status, 403);
  assert.equal(calls.length, 0);
});

test("login verifies membership before setting an HttpOnly cookie and never returns tokens", async () => {
  const response = await request("/session", {
    method: "POST", cookie: "", body: { email: "staff@example.invalid", password: "test-only" },
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api\/admin/);
  assert.deepEqual(await response.json(), { authenticated: true, configured: true });
  assert(calls.filter(call => call.url.pathname.includes("/rest/")).every(call => call.options.headers.Authorization === "Bearer test-jwt"));
  staff = false;
  const denied = await request("/session", {
    method: "POST", cookie: "", body: { email: "customer@example.invalid", password: "test-only" },
  });
  assert.equal(denied.status, 403);
  assert(!denied.headers.get("set-cookie")?.includes("test-jwt"));
});

test("session and logout handle missing setup and expiration without exposing secrets", async () => {
  delete process.env.SUPABASE_URL;
  assert.deepEqual(await (await request("/session")).json(), { authenticated: false, configured: false });
  process.env.SUPABASE_URL = "https://supabase.test";
  invalidToken = true;
  assert.deepEqual(await (await request("/session")).json(), { authenticated: false, configured: true });
  const response = await request("/session", { method: "DELETE" });
  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
});

test("authorized catalog reads include disabled records", async () => {
  occasions[0].is_active = false;
  const response = await request("/catalog");
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.equal(catalog.occasions[0].is_active, false);
  assert.equal(catalog.products[0].price, 12.125);
  assert(calls.every(call => call.options.headers.apikey === "sb_publishable_test_only"));
});

test("create, edit, disable and re-enable save the full record with the staff JWT", async () => {
  for (const [path, method, body, status] of [
    ["/products", "POST", product, 201],
    ["/products/test-gift", "PUT", { ...product, name_en: " Revised ", price: 9.999 }, 200],
    ["/products/test-gift", "PUT", { ...product, is_available: false }, 200],
    ["/products/test-gift", "PUT", product, 200],
    ["/occasions", "POST", occasion, 201],
    ["/occasions/birthday", "PUT", { ...occasion, is_active: false }, 200],
    ["/occasions/birthday", "PUT", occasion, 200],
  ]) {
    const response = await request(path, { method, body });
    assert.equal(response.status, status, await response.clone().text());
    assert.equal((await response.json()).id, body.id);
  }
  assert.equal(saved[1].name_en, "Revised");
  assert.equal(saved[1].price, 9.999);
  assert.equal(saved[2].is_available, false);
  const writes = calls.filter(call => ["POST", "PATCH"].includes(call.options.method));
  assert(writes.every(call => call.options.headers.Authorization === "Bearer test-jwt"));
  assert(writes.every(call => call.options.headers.Prefer === "return=representation"));
});

test("invalid prices, blank/missing bilingual text, contents and bad references never write", async () => {
  const cases = [
    { price: 0 }, { price: -1 }, { price: 1.2345 }, { price: 1000001 }, { price: "12" },
    { name_ar: " \t " }, { description_en: "" }, { delivery_ar: undefined },
    { contents_ar: [] }, { contents_ar: [" "] }, { contents_ar: ["one", "two"] },
    { display_order: -1 }, { is_available: "true" }, { occasion_id: "nonexistent" },
  ];
  for (const change of cases) {
    const response = await request("/products", { method: "POST", body: { ...product, ...change } });
    assert.equal(response.status, 400, JSON.stringify(change));
  }
  occasions[0].is_active = false;
  assert.equal((await request("/products", { method: "POST", body: product })).status, 400);
  assert.equal(saved.length, 0);
  assert.equal((await request("/products", { method: "POST", body: { ...product, is_available: false } })).status, 201);
});

test("occasion validation, immutable IDs, conflicts and upstream failures are explicit", async () => {
  for (const change of [{ name_ar: " " }, { id: "bad id" }, { icon: "invalid" }, { display_order: 1.5 }]) {
    assert.equal((await request("/occasions", { method: "POST", body: { ...occasion, ...change } })).status, 400);
  }
  assert.equal((await request("/products/another", { method: "PUT", body: product })).status, 400);
  assert.equal((await request("/occasions/another", { method: "PUT", body: occasion })).status, 400);
  saveStatus = 409;
  assert.equal((await request("/products", { method: "POST", body: product })).status, 409);
  upstreamStatus = 503;
  assert.equal((await request("/catalog")).status, 503);
});
