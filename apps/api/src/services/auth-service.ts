import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { RoleCode, SessionUser } from "@sales-promoters/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { requireConfig } from "../config/env";

const PASSWORD_ROUNDS = 12;

interface UserWithRole {
  id: string;
  email: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  companyId?: string | null;
  company?: {
    id: string;
    code: number;
    name: string;
  } | null;
  role: {
    code: RoleCode;
  };
}

interface RefreshPayload extends jwt.JwtPayload {
  sub: string;
  jti: string;
  type: "refresh";
}

export function toSessionUser(user: UserWithRole): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.code,
    status: user.status,
    companyId: user.companyId ?? null,
    company: user.company
      ? {
          id: user.company.id,
          code: user.company.code,
          name: user.company.name
        }
      : null
  };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_ROUNDS);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseExpiry(input: string) {
  const match = /^(\d+)([smhd])$/.exec(input.trim());

  if (!match) {
    throw new AppError(500, "INVALID_TOKEN_EXPIRY", `Invalid token expiry value: ${input}`);
  }

  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return value * multipliers[unit];
}

export async function issueTokenPair(user: UserWithRole) {
  const config = requireConfig();
  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role.code,
      companyId: user.companyId,
      type: "access"
    },
    config.JWT_ACCESS_SECRET,
    {
      expiresIn: config.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"]
    }
  );

  const refreshJti = crypto.randomUUID();
  const refreshToken = jwt.sign(
    {
      sub: user.id,
      jti: refreshJti,
      type: "refresh"
    },
    config.JWT_REFRESH_SECRET,
    {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"]
    }
  );

  const refreshRecord = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + parseExpiry(config.JWT_REFRESH_EXPIRES_IN))
    }
  });

  return {
    accessToken,
    refreshToken,
    refreshRecordId: refreshRecord.id
  };
}

export async function consumeRefreshToken(refreshToken: string) {
  const config = requireConfig();
  let payload: RefreshPayload;

  try {
    payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as RefreshPayload;
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid or expired refresh token.");
  }

  if (payload.type !== "refresh" || !payload.sub || !payload.jti) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid refresh token payload.");
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { role: true, company: true }
      }
    }
  });

  if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) {
    throw new AppError(401, "UNAUTHORIZED", "Refresh token is no longer valid.");
  }

  if (existing.user.status !== "ACTIVE") {
    throw new AppError(401, "UNAUTHORIZED", "User is not active.");
  }

  const nextPair = await issueTokenPair(existing.user);

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date(),
      replacedByTokenId: nextPair.refreshRecordId
    }
  });

  return {
    ...nextPair,
    user: existing.user
  };
}

export async function revokeRefreshToken(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
}
