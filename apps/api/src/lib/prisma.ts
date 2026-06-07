import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function databaseUrlForRuntime() {
  const raw = process.env.DATABASE_URL;

  if (!raw) {
    return raw;
  }

  const url = new URL(raw);

  // Vercel/serverless can create many warm instances. Keep each Prisma engine
  // tiny so the Supabase pooler is not exhausted by dashboard fan-out requests.
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "1");
  }

  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "20");
  }

  return url.toString();
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrlForRuntime()
      }
    },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
