import Stripe from "stripe";
import { StripeSync, runMigrations } from "stripe-replit-sync";
import { logger } from "./logger";

let initialization: Promise<{ stripe: Stripe; sync: StripeSync }> | undefined;

export function stripeConfiguration() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const databaseUrl = process.env.SUPABASE_DATABASE_URL;
  const storefrontUrl = process.env.TAWWA_STOREFRONT_URL;
  const apiUrl = process.env.TAWWA_API_URL;
  const chargeCurrency = process.env.TAWWA_STRIPE_CURRENCY;
  const kwdToChargeRate = Number(process.env.TAWWA_KWD_TO_USD_RATE);
  const kwdToChargeRateDate = process.env.TAWWA_KWD_TO_USD_RATE_DATE;
  if (!secretKey || !databaseUrl || !storefrontUrl || !apiUrl || !chargeCurrency || !kwdToChargeRateDate) {
    throw new Error("Stripe checkout environment is incomplete");
  }
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Tawwa checkout is restricted to Stripe test mode");
  }
  if (
    chargeCurrency !== "usd" ||
    !Number.isFinite(kwdToChargeRate) ||
    kwdToChargeRate <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(kwdToChargeRateDate) ||
    Number.isNaN(Date.parse(`${kwdToChargeRateDate}T00:00:00Z`))
  ) {
    throw new Error("Tawwa requires a valid USD conversion rate for test checkout");
  }
  const storefront = new URL(storefrontUrl);
  const api = new URL(apiUrl);
  if (storefront.protocol !== "https:" || api.protocol !== "https:") {
    throw new Error("Payment return and webhook URLs must use HTTPS");
  }
  return {
    secretKey,
    databaseUrl,
    storefrontUrl: storefront.origin,
    apiUrl: api.origin,
    chargeCurrency,
    kwdToChargeRate,
    kwdToChargeRateDate,
  };
}

export function getStripeRuntime(): Promise<{ stripe: Stripe; sync: StripeSync }> {
  if (!initialization) {
    initialization = (async () => {
      const config = stripeConfiguration();
      await runMigrations({ databaseUrl: config.databaseUrl, logger });
      const stripe = new Stripe(config.secretKey);
      const sync = new StripeSync({
        poolConfig: { connectionString: config.databaseUrl, max: 2 },
        stripeSecretKey: config.secretKey,
        logger,
      });
      await sync.findOrCreateManagedWebhook(
        `${config.apiUrl}/api/stripe/webhook`,
        {
          enabled_events: sync.getSupportedEventTypes(),
          description: `Tawwa Stripe test-mode checkout (${config.chargeCurrency.toUpperCase()})`,
        },
      );
      await sync.syncBackfill({ object: "all" });
      return { stripe, sync };
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}
