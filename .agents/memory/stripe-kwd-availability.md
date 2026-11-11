---
name: Stripe KWD availability
description: Stripe test-catalog seeding requires the connected account to support KWD charges.
---

The connected Stripe test account rejected KWD prices and reported that KWD requires adding a bank account for that currency. The user explicitly chose USD for sandbox checkout. Keep storefront prices in KWD, show the USD estimate before redirecting, and use the configured dated rate snapshot; do not treat sandbox setup as authorization for live charges.

**Why:** The storefront displays and totals gift prices in KWD, while the Stripe account cannot currently create KWD Prices. The user approved a transparent USD conversion for testing, not an unannounced currency change or real-card checkout.

**How to apply:** Keep USD test checkout gated on a successfully seeded catalog and matching currency/rate/date settings. Reconfirm with the user before changing charge currency, rate policy, or Stripe mode.
