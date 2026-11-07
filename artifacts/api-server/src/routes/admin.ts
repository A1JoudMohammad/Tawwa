import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import { createHash } from "node:crypto";
import {
  LoginAdminBody, CreateAdminProductBody, CreateAdminOccasionBody,
  UpdateAdminProductParams, UpdateAdminOccasionParams, GetAdminCatalogResponse,
  CreateAdminProductResponse, CreateAdminOccasionResponse,
} from "@workspace/api-zod";
import { connection } from "../lib/catalog";
import { AdminError, supabase, requireStaff, adminRows, saveRecord, productFields, occasionFields, trimInput, validPrice } from "../lib/admin-catalog";

const router: IRouter = Router();
const cookieName = "tawwa_staff";
const attempts = new Map<string, { count: number; until: number }>();
const guarded = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { void handler(req, res).catch(next); };
const cookieOptions = (req: Request) => ({
  httpOnly: true, sameSite: "strict" as const, path: "/api/admin",
  secure: process.env.NODE_ENV === "production" || req.secure || req.get("x-forwarded-proto") === "https",
});

router.use("/admin", cookieParser(), (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  // A cross-site form cannot send this header. Browser CORS does not permit
  // credentialed cross-origin requests (and SameSite=Strict adds a second gate).
  if (!["GET", "HEAD"].includes(req.method) &&
      (req.get("X-Tawwa-Admin") !== "1" || req.get("sec-fetch-site") === "cross-site")) {
    res.status(403).json({ error: "Please make this change from the staff editor." });
    return;
  }
  next();
});

router.get("/admin/session", guarded(async (req, res) => {
  try { connection(); } catch { res.json({ authenticated: false, configured: false }); return; }
  try {
    await requireStaff(req.cookies[cookieName]);
    res.json({ authenticated: true, configured: true });
  } catch (error) {
    if (error instanceof AdminError && [401, 403].includes(error.status)) {
      res.clearCookie(cookieName, cookieOptions(req));
      res.json({ authenticated: false, configured: true });
    } else { throw error; }
  }
}));

router.post("/admin/session", guarded(async (req, res) => {
  const parsed = LoginAdminBody.safeParse(req.body);
  if (!parsed.success) throw new AdminError(400, "Enter a valid email address and password.");
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  // Hash email addresses so this short-lived throttle never retains credentials
  // or staff contact details. Bound map growth during abusive traffic.
  const keys = [`ip:${req.ip}`, `email:${createHash("sha256").update(parsed.data.email.toLowerCase()).digest("hex")}`];
  for (const key of keys) {
    const entry = attempts.get(key);
    if (entry && entry.count >= 15) {
      res.setHeader("Retry-After", Math.ceil((entry.until - now) / 1000));
      throw new AdminError(429, "Too many sign-in attempts. Please try again in 15 minutes.");
    }
  }
  if (attempts.size >= 10000) throw new AdminError(429, "Sign-in is busy. Please try again later.");
  for (const key of keys) {
    const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
    entry.count++; attempts.set(key, entry);
  }
  const response = await supabase("/auth/v1/token?grant_type=password", undefined, {
    method: "POST", body: JSON.stringify(parsed.data),
  });
  if (!response.ok) {
    if (response.status === 429) throw new AdminError(429, "Too many sign-in attempts. Please try again later.");
    if (response.status >= 500) throw new AdminError(503, "Sign-in is temporarily unavailable.");
    throw new AdminError(401, "Email or password is incorrect.");
  }
  const session = await response.json() as { access_token?: string; expires_in?: number };
  if (!session.access_token) throw new AdminError(503, "Sign-in returned an invalid session.");
  await requireStaff(session.access_token);
  keys.forEach(key => attempts.delete(key));
  res.cookie(cookieName, session.access_token, {
    ...cookieOptions(req), maxAge: Math.min(session.expires_in ?? 3600, 3600) * 1000,
  });
  res.json({ authenticated: true, configured: true });
}));

router.delete("/admin/session", guarded(async (req, res) => {
  // Always clear the local session, even if Supabase is unavailable.
  res.clearCookie(cookieName, cookieOptions(req));
  if (req.cookies[cookieName]) {
    await supabase("/auth/v1/logout", req.cookies[cookieName], { method: "POST" }).catch(() => undefined);
  }
  res.sendStatus(204);
}));

router.use("/admin", (req, res, next) => {
  void requireStaff(req.cookies[cookieName]).then(token => {
    res.locals.staffToken = token;
    next();
  }).catch(next);
});

router.get("/admin/catalog", guarded(async (_req, res) => {
  const token = res.locals.staffToken as string;
  const [products, occasions] = await Promise.all([
    adminRows("tawwa_products", token, productFields),
    adminRows("tawwa_occasions", token, occasionFields),
  ]);
  res.json(GetAdminCatalogResponse.parse({ products, occasions }));
}));

for (const update of [false, true]) {
  const method = update ? "put" : "post";
  router[method](`/admin/products${update ? "/:id" : ""}`, guarded(async (req, res) => {
    const parsed = CreateAdminProductBody.safeParse(trimInput(req.body));
    if (!parsed.success) throw new AdminError(400, "Complete all required English and Arabic fields and check the product values.");
    const data = parsed.data;
    if (update) {
      const params = UpdateAdminProductParams.safeParse(req.params);
      if (!params.success || params.data.id !== data.id) throw new AdminError(400, "Product IDs cannot be changed.");
    }
    if (!validPrice(data.price)) throw new AdminError(400, "Price must be positive KWD with at most three decimal places.");
    if (data.contents_en.length !== data.contents_ar.length) throw new AdminError(400, "Provide an Arabic translation for each contents item.");
    const token = res.locals.staffToken as string;
    const occasions = await adminRows("tawwa_occasions", token, occasionFields) as { id: string; is_active: boolean }[];
    const occasion = occasions.find(row => row.id === data.occasion_id);
    if (!occasion) throw new AdminError(400, "Choose an existing occasion.");
    if (data.is_available && !occasion.is_active) throw new AdminError(400, "Enable the occasion before making this product available.");
    const saved = await saveRecord("tawwa_products", token, data, update, productFields);
    req.log.info({ action: update ? "update" : "create", recordId: data.id, entity: "product" }, "Staff catalog change saved");
    res.status(update ? 200 : 201).json(CreateAdminProductResponse.parse(saved));
  }));
  router[method](`/admin/occasions${update ? "/:id" : ""}`, guarded(async (req, res) => {
    const parsed = CreateAdminOccasionBody.safeParse(trimInput(req.body));
    if (!parsed.success) throw new AdminError(400, "Complete both occasion names, icon, status and display order.");
    if (update) {
      const params = UpdateAdminOccasionParams.safeParse(req.params);
      if (!params.success || params.data.id !== parsed.data.id) throw new AdminError(400, "Occasion IDs cannot be changed.");
    }
    const saved = await saveRecord("tawwa_occasions", res.locals.staffToken as string, parsed.data, update, occasionFields);
    req.log.info({ action: update ? "update" : "create", recordId: parsed.data.id, entity: "occasion" }, "Staff catalog change saved");
    res.status(update ? 200 : 201).json(CreateAdminOccasionResponse.parse(saved));
  }));
}

router.use("/admin", (error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof AdminError) {
    if (error.status === 401 || error.status === 403) res.clearCookie(cookieName, cookieOptions(req));
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log.error("Staff catalog request failed");
  res.status(503).json({ error: "The staff catalog is temporarily unavailable. Please try again." });
});

export default router;
