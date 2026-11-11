import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";

test("checkout and order status reject missing and cross-site origins before touching payment services", () => {
  execFileSync(process.execPath, ["build.mjs"], { stdio: "pipe" });
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    VERCEL: "1",
    TAWWA_STOREFRONT_URL: "https://store.example",
    TAWWA_API_URL: "https://api.example",
    STRIPE_SECRET_KEY: "sk_test_security_test_only",
    SUPABASE_DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
    TAWWA_STRIPE_CURRENCY: "usd",
    TAWWA_KWD_TO_USD_RATE: "3.221725",
    TAWWA_KWD_TO_USD_RATE_DATE: "2026-11-11",
    TAWWA_DELIVERY_FEE_KWD: "0.500",
  };
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { createServer } from "node:http";
    import { once } from "node:events";
    import app from "./dist/index.mjs";
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = "http://127.0.0.1:" + server.address().port;
    try {
      for (const path of ["/api/payments/checkout", "/api/payments/order-status"]) {
        const missing = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        assert.equal(missing.status, 403, path + " must reject missing Origin");
        const crossSite = await fetch(base + path, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "https://attacker.example" },
          body: "{}",
        });
        assert.equal(crossSite.status, 403, path + " must reject a different Origin");
      }
      const sameSiteInvalidBody = await fetch(base + "/api/payments/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://store.example" },
        body: "{}",
      });
      assert.equal(sameSiteInvalidBody.status, 400, "the configured storefront Origin passes the CSRF gate");
      assert.equal(sameSiteInvalidBody.headers.get("set-cookie"), null, "failed checkout does not issue an order cookie");
      const checkoutConfig = await fetch(base + "/api/payments/config");
      assert.equal(checkoutConfig.status, 503, "checkout is disabled until the Stripe catalog is ready");
      process.env.TAWWA_STRIPE_CURRENCY = "usd";
      process.env.TAWWA_KWD_TO_USD_RATE = "3.221725";
      process.env.TAWWA_KWD_TO_USD_RATE_DATE = "2026-11-11";
      process.env.TAWWA_STRIPE_CATALOG_READY = "true";
      const readyConfig = await fetch(base + "/api/payments/config");
      assert.equal(readyConfig.status, 200);
      assert.deepEqual(await readyConfig.json(), {
        deliveryFee: 0.5,
        currency: "usd",
        kwdToChargeRate: 3.221725,
        kwdToChargeRateDate: "2026-11-11",
        testMode: true,
      });
      assert.equal(readyConfig.headers.get("cache-control"), "no-store");
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  `], { env, encoding: "utf8", timeout: 20000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
