import { Router, type IRouter } from "express";
import healthRouter from "./health";
import catalogRouter from "./catalog";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(adminRouter);

export default router;
