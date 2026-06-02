import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate } from "../middleware/auth";
import {
  consumeRefreshToken,
  issueTokenPair,
  revokeRefreshToken,
  toSessionUser,
  verifyPassword
} from "../services/auth-service";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const credentials = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: credentials.email.toLowerCase() },
      include: { role: true }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid e-mail or password.");
    }

    const validPassword = await verifyPassword(credentials.password, user.passwordHash);

    if (!validPassword) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid e-mail or password.");
    }

    const tokens = await issueTokenPair(user);

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: toSessionUser(user)
    });
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await consumeRefreshToken(refreshToken);

    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: toSessionUser(result.user)
    });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await revokeRefreshToken(refreshToken);
    res.json({ status: "ok" });
  })
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);
