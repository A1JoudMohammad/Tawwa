---
name: Stripe KWD availability
description: Stripe test-catalog seeding requires the connected account to support KWD charges.
---

The connected Stripe test account rejected KWD prices and reported that KWD requires adding a bank account for that currency. Do not mark the catalog ready or silently charge another currency until KWD support is enabled or the user explicitly chooses a different charge currency.

**Why:** The storefront displays and totals gift prices in KWD, so changing only the Stripe charge currency would make the amount charged differ from what customers see.

**How to apply:** Before enabling checkout after catalog changes, successfully seed and verify KWD prices in the same Stripe mode/account used by the API.
