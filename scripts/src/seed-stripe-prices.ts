import { getStripeClient } from "./stripeClient";

type CatalogProduct = {
  id: string;
  name_en: string;
  description_en: string;
  price: number | string;
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function toFils(value: number) {
  const fils = Math.round(value * 1000);
  if (!Number.isFinite(value) || value < 0 || Math.abs(fils / 1000 - value) > 0.000001) {
    throw new Error("Catalog prices and delivery fees must be valid KWD fils amounts.");
  }
  return fils;
}

let stage = "loading configuration";
async function main() {
  const stripe = getStripeClient();
  stage = "reading Supabase catalog";
  const supabaseUrl = required("SUPABASE_URL");
  const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
  const catalogUrl = new URL("/rest/v1/tawwa_products", supabaseUrl);
  catalogUrl.searchParams.set("select", "id,name_en,description_en,price");
  catalogUrl.searchParams.set("is_available", "eq.true");
  catalogUrl.searchParams.set("order", "display_order.asc,id.asc");
  const response = await fetch(catalogUrl, {
    headers: { apikey: publishableKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Supabase catalog fetch failed (${response.status}).`);
  const catalog: unknown = await response.json();
  if (!Array.isArray(catalog) || catalog.length === 0) throw new Error("The available Supabase gift catalog is empty.");

  const listed = await stripe.products.list({ active: true, limit: 100 });
  stage = "syncing gift products and prices";
  const products = listed.data;
  let createdPrices = 0;
  for (const item of catalog as CatalogProduct[]) {
    const amount = toFils(Number(item.price));
    let product = products.find((candidate) => candidate.metadata.tawwa_product_id === item.id);
    if (!product) {
      stage = "creating Stripe test products";
      product = await stripe.products.create({
        name: item.name_en,
        description: item.description_en,
        metadata: { tawwa_product_id: item.id },
      }, { idempotencyKey: `tawwa-product-${item.id}` });
      products.push(product);
    } else if (product.name !== item.name_en || product.description !== item.description_en) {
      product = await stripe.products.update(product.id, {
        name: item.name_en,
        description: item.description_en,
      });
    }
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
    const matchingPrice = prices.data.find((price) =>
      price.currency === "kwd" && price.unit_amount === amount && price.type === "one_time");
    if (!matchingPrice) {
      stage = "creating Stripe test prices";
      await stripe.prices.create({
        product: product.id,
        unit_amount: amount,
        currency: "kwd",
        metadata: { catalog_product_id: item.id },
      }, { idempotencyKey: `tawwa-price-${item.id}-${amount}` });
      createdPrices++;
    }
  }

  const deliveryFee = toFils(Number(required("TAWWA_DELIVERY_FEE_KWD")));
  stage = "syncing delivery price";
  if (deliveryFee > 0) {
    let delivery = products.find((candidate) => candidate.metadata.tawwa_delivery === "true");
    if (!delivery) {
      delivery = await stripe.products.create({
        name: "Kuwait delivery",
        description: "Delivery for your Tawwa gift order.",
        metadata: { tawwa_delivery: "true" },
      }, { idempotencyKey: "tawwa-product-delivery" });
    }
    const prices = await stripe.prices.list({ product: delivery.id, active: true, limit: 100 });
    if (!prices.data.some((price) => price.currency === "kwd" && price.unit_amount === deliveryFee && price.type === "one_time")) {
      await stripe.prices.create({
        product: delivery.id,
        unit_amount: deliveryFee,
        currency: "kwd",
        metadata: { catalog_product_id: "delivery" },
      }, { idempotencyKey: `tawwa-price-delivery-${deliveryFee}` });
      createdPrices++;
    }
  }
  console.log(`Stripe test catalog ready: ${catalog.length} gifts, ${createdPrices} new prices.`);
}

main().catch((caught: unknown) => {
  const error = caught as { type?: string; code?: string; param?: string; statusCode?: number };
  console.error(JSON.stringify({
    error: "Stripe test catalog setup failed.",
    stage,
    type: error?.type ?? "configuration_or_network_error",
    code: error?.code ?? "unknown",
    parameter: error?.param,
    statusCode: error?.statusCode,
    message: (error as { message?: string }).message?.replace(/sk_(?:live|test)_[A-Za-z0-9]+/g, "[redacted]").slice(0, 240),
  }));
  process.exitCode = 1;
});
