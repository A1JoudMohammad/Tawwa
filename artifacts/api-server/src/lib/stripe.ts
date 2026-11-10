import Stripe from "stripe";
import { StripeSync, runMigrations } from "stripe-replit-sync";
import { logger } from "./logger";

let initialization: Promise<{ stripe: Stripe; sync: StripeSync }> | undefined;

export function stripeConfiguration() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const databaseUrl = process.env.SUPABASE_DATABASE_URL;
  const storefrontUrl = process.env.TAWWA_STOREFRONT_URL;
  const apiUrl = process.env.TAWWA_API_URL;
  if (!secretKey || !databaseUrl || !storefrontUrl || !apiUrl) {
    throw new Error("Stripe checkout environment is incomplete");
  }
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Tawwa checkout is restricted to Stripe test mode");
  }
  const storefront = new URL(storefrontUrl);
  const api = new URL(apiUrl);
  if (storefront.protocol !== "https:" || api.protocol !== "https:") {
    throw new Error("Payment return and webhook URLs must use HTTPS");
  }
  return { secretKey, databaseUrl, storefrontUrl: storefront.origin, apiUrl: api.origin };
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
          description: "Tawwa Stripe test-mode checkout",
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
