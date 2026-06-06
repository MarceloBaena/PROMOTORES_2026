import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, asAppError } from "../lib/errors";
import { logger } from "../lib/logger";

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, "NOT_FOUND", `Route ${req.method} ${req.path} was not found.`));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const normalized = error instanceof ZodError
    ? (() => {
        const firstIssue = error.issues[0];
        const field = firstIssue?.path.join(".");
        const message = firstIssue
          ? `${field ? `${field}: ` : ""}${firstIssue.message}`
          : "Invalid request payload.";

        return new AppError(400, "VALIDATION_ERROR", message, error.flatten());
      })()
    : asAppError(error);

  if (normalized.statusCode >= 500) {
    logger.error({ err: normalized, path: req.path }, "request failed");
  }

  res.status(normalized.statusCode).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details
    }
  });
}
