import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import Stripe from "stripe";
import pg from "pg";
import {
  CreateTawwaCheckoutBody,
  CreateTawwaCheckoutResponse,
  GetTawwaPaymentOrderBody,
  GetTawwaPaymentOrderResponse,
} from "@workspace/api-zod";
import { readCatalog } from "../lib/catalog";
import { getStripeRuntime, stripeConfiguration } from "../lib/stripe";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const { Pool } = pg;
let pool: pg.Pool | undefined;
function orderDb() {
  const { databaseUrl } = stripeConfiguration();
  pool ??= new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 8000, idleTimeoutMillis: 10_000 });
  return pool;
}

function minorUnits(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid KWD amount");
  const minor = Math.round(amount * 1000);
  if (Math.abs(minor / 1000 - amount) > 0.000001) {
    throw new Error("Amounts must be in fils");
  }
  return minor;
}

function configuredDeliveryFee() {
  const value = Number(process.env.TAWWA_DELIVERY_FEE_KWD);
  if (!Number.isFinite(value) || value < 0) throw new Error("Delivery fee is not configured");
  return minorUnits(value);
}

function todayInKuwait() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuwait",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function accessTokenMatches(expectedHash: string, token: string) {
  const actual = Buffer.from(hash(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function getPrice(
  stripe: Stripe,
  input: { productId: string; amount: number },
) {
  const metadataKey = input.productId === "delivery" ? "tawwa_delivery" : "tawwa_product_id";
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find((item) => item.metadata[metadataKey] === (input.productId === "delivery" ? "true" : input.productId));
  if (!product) throw new Error("Stripe gift prices are not prepared yet. Please try again shortly.");
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = prices.data.find((item) =>
    item.currency === "kwd" &&
    item.unit_amount === input.amount &&
    item.active &&
    item.type === "one_time"
  );
  if (!price) throw new Error("Stripe gift prices are not prepared yet. Please try again shortly.");
  return price;
}

router.get("/payments/config", (_req, res) => {
  try {
    if (process.env.TAWWA_STRIPE_CATALOG_READY !== "true") {
      res.status(503).json({ error: "Stripe gift pricing is not ready." });
      return;
    }
    stripeConfiguration();
    res.setHeader("Cache-Control", "no-store");
    res.json({ deliveryFee: configuredDeliveryFee() / 1000, currency: "kwd", testMode: true });
  } catch {
    res.status(503).json({ error: "Payments are not configured." });
  }
});

router.post("/payments/checkout", async (req, res) => {
  const parsed = CreateTawwaCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please check the checkout details and try again." });
    return;
  }
  const idempotencyKey = req.get("Idempotency-Key") ?? "";
  const accessToken = req.get("X-Order-Access-Token") ?? "";
  if (!/^[\w-]{16,100}$/.test(idempotencyKey) || !/^[a-f0-9]{64}$/.test(accessToken)) {
    res.status(400).json({ error: "Invalid checkout request." });
    return;
  }

  try {
    const config = stripeConfiguration();
    const deliveryFeeMinor = configuredDeliveryFee();
    const catalog = await readCatalog();
    const input = parsed.data;
    if (!catalog.governorates.includes(input.governorate)) {
      res.status(400).json({ error: "Choose a valid Kuwait governorate." });
      return;
    }
    if (new Set(input.items.map((item) => item.productId)).size !== input.items.length) {
      res.status(400).json({ error: "Remove duplicate gift boxes before checkout." });
      return;
    }
    for (const item of input.items) {
      if (item.date && item.date.toISOString().slice(0, 10) < todayInKuwait()) {
        res.status(400).json({ error: "Choose a delivery date that has not passed." });
        return;
      }
    }

    const snapshot = input.items.map((item) => {
      const product = catalog.products.find((entry) => entry.id === item.productId);
      if (!product) throw new Error("A gift in this cart is no longer available.");
      return {
        productId: product.id,
        name: product.name,
        nameAr: product.ar,
        quantity: item.quantity,
        unitPrice: product.price,
        unitAmount: minorUnits(product.price),
        message: item.message?.trim() ?? "",
        date: item.date?.toISOString().slice(0, 10) ?? "",
      };
    });
    const subtotalMinor = snapshot.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
    const totalMinor = subtotalMinor + deliveryFeeMinor;
    const requestHash = hash(JSON.stringify({ ...input, items: snapshot }));
    const stripeRuntime = await getStripeRuntime();
    const productPrices = await Promise.all(snapshot.map((item) => getPrice(stripeRuntime.stripe, {
      productId: item.productId,
      amount: item.unitAmount,
    })));
    const lineItems: import("stripe").default.Checkout.SessionCreateParams.LineItem[] =
      snapshot.map((item, index) => ({ price: productPrices[index].id, quantity: item.quantity }));
    if (deliveryFeeMinor > 0) {
      const delivery = await getPrice(stripeRuntime.stripe, {
        productId: "delivery",
        amount: deliveryFeeMinor,
      });
      lineItems.push({ price: delivery.id, quantity: 1 });
    }

    const orderId = randomBytes(16).toString("hex");
    // Format a random UUID without reducing its entropy.
    const id = `${orderId.slice(0, 8)}-${orderId.slice(8, 12)}-4${orderId.slice(13, 16)}-a${orderId.slice(17, 20)}-${orderId.slice(20)}`;
    const db = orderDb();
    await db.query(
      `INSERT INTO public.tawwa_orders
        (id, idempotency_key, request_hash, order_access_token_hash, currency,
         subtotal_minor, delivery_fee_minor, total_minor, items, customer)
       VALUES ($1, $2, $3, $4, 'kwd', $5, $6, $7, $8::jsonb, $9::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        id, idempotencyKey, requestHash, hash(accessToken), subtotalMinor,
        deliveryFeeMinor, totalMinor, JSON.stringify(snapshot),
        JSON.stringify({
          email: input.email,
          name: input.name,
          phone: input.phone,
          governorate: input.governorate,
          address: input.address,
          recipient: input.recipient ?? "",
        }),
      ],
    );
    const existing = await db.query(
      `SELECT id, request_hash, order_access_token_hash, status,
              stripe_checkout_session_id, total_minor
       FROM public.tawwa_orders WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    const order = existing.rows[0];
    if (!order || order.request_hash !== requestHash || !accessTokenMatches(order.order_access_token_hash, accessToken)) {
      res.status(409).json({ error: "This checkout attempt was already used for different details. Please try again." });
      return;
    }
    if (order.stripe_checkout_session_id) {
      const session = await stripeRuntime.stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
      if (session.url) {
        res.json(CreateTawwaCheckoutResponse.parse({
          checkoutUrl: session.url,
          orderId: order.id,
          deliveryFee: deliveryFeeMinor / 1000,
          total: Number(order.total_minor) / 1000,
        }));
        return;
      }
    }

    const successUrl =
      `${config.storefrontUrl}/checkout/return` +
      `?order_id=${encodeURIComponent(order.id)}` +
      `&access_token=${encodeURIComponent(accessToken)}` +
      "&session_id={CHECKOUT_SESSION_ID}";
    const cancelUrl = new URL("/cart?payment=cancelled", config.storefrontUrl);
    const session = await stripeRuntime.stripe.checkout.sessions.create({
      mode: "payment",
      allowed_payment_method_types: ["card"],
      line_items: lineItems,
      customer_email: input.email,
      client_reference_id: order.id,
      metadata: { tawwa_order_id: order.id },
      payment_intent_data: { metadata: { tawwa_order_id: order.id } },
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
    }, { idempotencyKey: `tawwa-checkout-${idempotencyKey}` });
    await db.query(
      `UPDATE public.tawwa_orders SET stripe_checkout_session_id = $2 WHERE id = $1`,
      [order.id, session.id],
    );
    if (!session.url) throw new Error("Stripe did not return a hosted checkout URL");
    res.json(CreateTawwaCheckoutResponse.parse({
      checkoutUrl: session.url,
      orderId: order.id,
      deliveryFee: deliveryFeeMinor / 1000,
      total: totalMinor / 1000,
    }));
  } catch (error) {
    if (error instanceof Error && /no longer available|Amounts must|Delivery fee is not configured|test mode|environment is incomplete|prices are not prepared/i.test(error.message)) {
      res.status(error.message.includes("not available") ? 409 : 503).json({ error: error.message });
      return;
    }
    logger.error({ err: error }, "Tawwa Stripe checkout failed");
    res.status(503).json({ error: "Secure checkout is temporarily unavailable. Your cart is saved; please try again." });
  }
});

router.post("/payments/order-status", async (req, res) => {
  const parsed = GetTawwaPaymentOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payment status request." });
    return;
  }
  try {
    const { stripe } = await getStripeRuntime();
    const db = orderDb();
    const result = await db.query(
      `SELECT id, order_access_token_hash, status, currency, subtotal_minor,
              delivery_fee_minor, total_minor, items, stripe_checkout_session_id
       FROM public.tawwa_orders WHERE id = $1`,
      [parsed.data.orderId],
    );
    const order = result.rows[0];
    if (!order || !accessTokenMatches(order.order_access_token_hash, parsed.data.accessToken)) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (order.stripe_checkout_session_id !== parsed.data.sessionId) {
      res.status(404).json({ error: "Payment session not found." });
      return;
    }
    const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId);
    if (session.metadata?.tawwa_order_id !== order.id ||
        session.amount_total !== Number(order.total_minor) ||
        session.currency !== "kwd") {
      res.status(404).json({ error: "Payment session not found." });
      return;
    }
    let status: "pending" | "paid" | "failed" | "expired" = order.status;
    if (session.payment_status === "paid") status = "paid";
    else if (session.status === "expired") status = "expired";
    else if (session.status === "complete" && session.payment_status === "unpaid") status = "failed";
    await db.query(
      `UPDATE public.tawwa_orders
       SET status = CASE WHEN status = 'paid' THEN 'paid' ELSE $2 END,
           stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
           paid_at = CASE WHEN $2 = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END
       WHERE id = $1`,
      [order.id, status, typeof session.payment_intent === "string" ? session.payment_intent : null],
    );
    const currentStatus = status === "paid" ? "paid" : status;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.json(GetTawwaPaymentOrderResponse.parse({
      orderId: order.id,
      status: currentStatus,
      currency: "kwd",
      subtotal: Number(order.subtotal_minor) / 1000,
      deliveryFee: Number(order.delivery_fee_minor) / 1000,
      total: Number(order.total_minor) / 1000,
      items: order.items,
    }));
  } catch (error) {
    logger.error({ err: error }, "Tawwa order status lookup failed");
    res.status(503).json({ error: "Payment status is temporarily unavailable." });
  }
});

export async function processTawwaWebhook(payload: Buffer, signature: string) {
  const { sync } = await getStripeRuntime();
  await sync.processWebhook(payload, signature);
  const event = JSON.parse(payload.toString("utf8")) as {
    type?: string;
    data?: { object?: Stripe.Checkout.Session };
  };
  const session = event.data?.object;
  if (!session?.metadata?.tawwa_order_id || !session.id || !event.type?.startsWith("checkout.session.")) return;
  let status: string | null = null;
  if (event.type === "checkout.session.completed" && session.payment_status === "paid") status = "paid";
  else if (event.type === "checkout.session.async_payment_succeeded") status = "paid";
  else if (event.type === "checkout.session.async_payment_failed") status = "failed";
  else if (event.type === "checkout.session.expired") status = "expired";
  if (!status) return;
  const db = orderDb();
  await db.query(
    `UPDATE public.tawwa_orders
     SET status = CASE WHEN status = 'paid' THEN 'paid' ELSE $3 END,
         stripe_payment_intent_id = COALESCE($4, stripe_payment_intent_id),
         paid_at = CASE WHEN $3 = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END
     WHERE id = $1 AND stripe_checkout_session_id = $2
       AND currency = $5 AND total_minor = $6`,
    [session.metadata.tawwa_order_id, session.id, status,
      typeof session.payment_intent === "string" ? session.payment_intent : null,
      session.currency, session.amount_total],
  );
}

export default router;
