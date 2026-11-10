import Stripe from "stripe";

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey?.startsWith("sk_test_")) {
    throw new Error("A Stripe test-mode secret key is required.");
  }
  return new Stripe(secretKey);
}
