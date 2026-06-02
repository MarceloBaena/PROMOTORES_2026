import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { RoleCode } from "@sales-promoters/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { requireConfig } from "../config/env";
import { asyncHandler } from "./async-handler";

interface AccessTokenPayload extends jwt.JwtPayload {
  sub: string;
  type: "access";
}

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "Missing bearer token.");
  }

  const config = requireConfig();
  let payload: AccessTokenPayload;

  try {
    payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid or expired access token.");
  }

  if (payload.type !== "access" || !payload.sub) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid access token payload.");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { role: true }
  });

  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "UNAUTHORIZED", "User is not active.");
  }

  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.code,
    status: user.status
  };

  next();
});

export function authorizeRoles(...roles: RoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHORIZED", "Authentication required."));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new AppError(403, "FORBIDDEN", "User does not have permission for this resource."));
      return;
    }

    next();
  };
}
