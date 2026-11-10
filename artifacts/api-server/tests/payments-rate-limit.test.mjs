import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, Module } from "node:module";
import { test } from "node:test";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";

const { outputFiles } = await build({
  entryPoints: ["src/lib/checkout-rate-limit.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
});
const rateLimitModule = new Module(`${process.cwd()}/tests/checkout-rate-limit-bundle.cjs`);
rateLimitModule.require = createRequire(rateLimitModule.id);
rateLimitModule._compile(outputFiles[0].text, rateLimitModule.id);
const {
  checkoutClientAddressHash,
  checkoutIdempotencyHash,
  consumeCheckoutAttempt,
  CHECKOUT_RATE_LIMIT,
  CHECKOUT_RATE_WINDOW_SECONDS,
} = rateLimitModule.exports;

async function setup() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(await readFile("supabase/migrations/202611100002_checkout_rate_limits.sql", "utf8"));
  return db;
}

const addressHash = checkoutClientAddressHash("203.0.113.8", "test-session-secret-with-at-least-32-characters");
const idemHash = (key) => checkoutIdempotencyHash(key.padEnd(16, "_"));

test("checkout retries reuse one allowance and the limit leaves room for normal shoppers", async () => {
  const db = await setup();
  try {
    for (let index = 0; index < CHECKOUT_RATE_LIMIT; index++) {
      assert.equal(await consumeCheckoutAttempt(db, addressHash, idemHash(`attempt-${index}`)), true);
    }
    assert.equal(await consumeCheckoutAttempt(db, addressHash, idemHash("new-attempt")), false);
    assert.equal(await consumeCheckoutAttempt(db, addressHash, idemHash("attempt-0")), true);
    assert.equal((await db.query(
      "select attempt_count from public.tawwa_checkout_rate_limits where ip_hash = $1",
      [addressHash],
    )).rows[0].attempt_count, CHECKOUT_RATE_LIMIT);
    assert.equal((await db.query(
      "select count(*)::int as count from public.tawwa_checkout_rate_limit_attempts where ip_hash = $1",
      [addressHash],
    )).rows[0].count, CHECKOUT_RATE_LIMIT);
  } finally {
    await db.close();
  }
});

test("parallel requests cannot exceed the shared per-address limit", async () => {
  const db = await setup();
  try {
    const results = await Promise.all(Array.from({ length: 40 }, (_, index) =>
      consumeCheckoutAttempt(db, addressHash, idemHash(`parallel-${index}`)),
    ));
    assert.equal(results.filter(Boolean).length, CHECKOUT_RATE_LIMIT);
    assert.equal((await db.query(
      "select attempt_count from public.tawwa_checkout_rate_limits where ip_hash = $1",
      [addressHash],
    )).rows[0].attempt_count, CHECKOUT_RATE_LIMIT);
  } finally {
    await db.close();
  }
});

test("the limit resets after its window and removes expired retry fingerprints", async () => {
  const db = await setup();
  try {
    for (let index = 0; index < CHECKOUT_RATE_LIMIT; index++) {
      await consumeCheckoutAttempt(db, addressHash, idemHash(`before-${index}`));
    }
    await db.exec(
      `update public.tawwa_checkout_rate_limits
       set window_started_at = clock_timestamp() - make_interval(secs => ${CHECKOUT_RATE_WINDOW_SECONDS + 1})
       where ip_hash = '${addressHash}'`,
    );
    assert.equal(await consumeCheckoutAttempt(db, addressHash, idemHash("after-expiry")), true);
    assert.equal((await db.query(
      "select attempt_count from public.tawwa_checkout_rate_limits where ip_hash = $1",
      [addressHash],
    )).rows[0].attempt_count, 1);
    assert.equal((await db.query(
      "select count(*)::int as count from public.tawwa_checkout_rate_limit_attempts where ip_hash = $1",
      [addressHash],
    )).rows[0].count, 1);
  } finally {
    await db.close();
  }
});

test("client addresses are stored as a keyed hash, not as raw IP text", async () => {
  const hashOne = checkoutClientAddressHash("203.0.113.8", "test-session-secret-with-at-least-32-characters");
  const hashTwo = checkoutClientAddressHash("203.0.113.8", "different-secret-with-at-least-32-characters");
  assert.match(hashOne, /^[a-f0-9]{64}$/);
  assert.notEqual(hashOne, "203.0.113.8");
  assert.notEqual(hashOne, hashTwo);
  assert.throws(() => checkoutClientAddressHash("not-an-ip", "test-session-secret-with-at-least-32-characters"));
});
