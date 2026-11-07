import { Router, type IRouter } from "express";
import { readCatalog } from "../lib/catalog";

const router: IRouter = Router();

router.get("/catalog", async (req, res): Promise<void> => {
  // Don't let a proxy or browser retain an old availability/price response.
  res.setHeader("Cache-Control", "no-store");
  try {
    res.json(await readCatalog());
  } catch {
    // Do not log upstream headers, configuration, or catalog contents.
    req.log.error("Unable to load the Supabase catalog");
    res.status(503).json({ error: "The gift catalog is temporarily unavailable. Please try again." });
  }
});

export default router;
