import { createHmac, createHash } from "node:crypto";
import { isIP } from "node:net";
import type pg from "pg";

export const CHECKOUT_RATE_LIMIT = 10;
export const CHECKOUT_RATE_WINDOW_SECONDS = 10 * 60;

export function checkoutClientAddressHash(address: string, secret: string) {
  if (!isIP(address)) throw new Error("A valid client address is required for checkout.");
  if (secret.length < 32) throw new Error("The checkout rate-limit secret is not configured.");
  return createHmac("sha256", secret)
    .update(`tawwa-checkout-rate-limit:v1:${address}`)
    .digest("hex");
}

export function checkoutIdempotencyHash(idempotencyKey: string) {
  return createHash("sha256").update(idempotencyKey).digest("hex");
}

export async function consumeCheckoutAttempt(
  db: pg.Pool,
  clientAddressHash: string,
  idempotencyKeyHash: string,
) {
  const result = await db.query<{ allowed: boolean }>(
    `SELECT public.consume_tawwa_checkout_attempt($1, $2, $3, $4) AS allowed`,
    [clientAddressHash, idempotencyKeyHash, CHECKOUT_RATE_LIMIT, CHECKOUT_RATE_WINDOW_SECONDS],
  );
  return result.rows[0]?.allowed === true;
}
