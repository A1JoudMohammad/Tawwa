import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { processTawwaWebhook } from "./payments";

const router: IRouter = Router();

router.post("/api/stripe/webhook", async (req, res) => {
  const signature = req.get("stripe-signature");
  if (!signature || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Invalid Stripe webhook request." });
    return;
  }
  try {
    await processTawwaWebhook(req.body, signature);
    res.json({ received: true });
  } catch (error) {
    logger.error({ err: error }, "Stripe webhook verification or processing failed");
    res.status(400).json({ error: "Stripe webhook could not be verified." });
  }
});

export default router;
