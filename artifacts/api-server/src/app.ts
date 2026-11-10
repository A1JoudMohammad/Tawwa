import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import stripeWebhookRouter from "./routes/stripe-webhook";

const app: Express = express();
// In Vercel, trust only the immediate platform proxy so req.ip reflects the
// client address instead of a serverless runtime's local socket address.
if (process.env.VERCEL === "1") app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Stripe requires the original signed bytes. This route must precede JSON parsing.
app.use(stripeWebhookRouter);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
