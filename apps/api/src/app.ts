import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { authRouter } from "./routes/auth";
import { supervisorsRouter } from "./routes/supervisors";
import { promotersRouter } from "./routes/promoters";
import { clientsRouter } from "./routes/clients";
import { routePlansRouter } from "./routes/route-plans";
import { visitsRouter } from "./routes/visits";
import { auditRouter } from "./routes/audit";
import { reportsRouter } from "./routes/reports";
import { authenticate, authorizeRoles } from "./middleware/auth";
import { errorHandler, notFound } from "./middleware/error-handler";
import { AppError } from "./lib/errors";
import { logger } from "./lib/logger";
import { collectBootIssues, getBootState, startDatabaseSetupIfEnabled } from "./startup";
import { loadConfig } from "./config/env";

function corsOrigin() {
  const { config } = loadConfig();
  const origin = config?.CORS_ORIGIN?.trim() || "*";

  if (origin === "*") {
    return true;
  }

  const allowedOrigins = origin.split(",").map((item) => item.trim()).filter(Boolean);

  return allowedOrigins.length > 0 ? allowedOrigins : true;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many authentication attempts. Try again later."
    }
  }
});

export function createApp() {
  const app = express();
  const bootIssues = collectBootIssues();

  app.set("trust proxy", 1);

  if (bootIssues.length > 0) {
    logger.error({ bootIssues }, "API boot configuration has issues");
  }

  startDatabaseSetupIfEnabled();

  app.disable("x-powered-by");
  app.use(
    pinoHttp({
      logger
    })
  );
  app.use(
    cors({
      origin: corsOrigin(),
      credentials: true
    })
  );
  app.use(helmet());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use("/uploads", express.static("uploads"));

  app.get("/", (_req, res) => {
    res.json({
      name: "Sales Promoters API",
      health: "/health"
    });
  });

  app.get("/health", (_req, res) => {
    const bootState = getBootState();

    if (bootIssues.length > 0) {
      res.status(503).json({
        status: "error",
        code: "BOOT_CONFIG_ERROR",
        issues: bootIssues
      });
      return;
    }

    if (bootState.status === "error") {
      res.status(503).json({
        status: "error",
        code: "BOOT_DATABASE_SETUP_FAILED",
        message: bootState.message,
        issues: bootState.issues
      });
      return;
    }

    res.json({ status: "ok" });
  });

  app.use((req, _res, next) => {
    const bootState = getBootState();

    if (bootIssues.length > 0 || bootState.status === "error") {
      next(
        new AppError(503, "API_NOT_READY", "API boot failed. Check /health for details.", {
          bootIssues,
          bootState
        })
      );
      return;
    }

    next();
  });

  app.use("/auth", authLimiter, authRouter);
  app.use("/supervisors", authenticate, authorizeRoles("ADMIN"), supervisorsRouter);
  app.use("/promoters", authenticate, authorizeRoles("ADMIN", "SUPERVISOR"), promotersRouter);
  app.use("/clients", authenticate, authorizeRoles("ADMIN", "SUPERVISOR"), clientsRouter);
  app.use("/routes", authenticate, authorizeRoles("ADMIN", "SUPERVISOR"), routePlansRouter);
  app.use("/visits", authenticate, authorizeRoles("ADMIN", "SUPERVISOR", "PROMOTOR"), visitsRouter);
  app.use("/audit", authenticate, authorizeRoles("ADMIN", "SUPERVISOR"), auditRouter);
  app.use("/reports", authenticate, authorizeRoles("ADMIN", "SUPERVISOR"), reportsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
