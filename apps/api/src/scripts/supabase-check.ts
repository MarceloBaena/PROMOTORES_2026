import "dotenv/config";
import { loadConfig } from "../config/env";
import { prisma } from "../lib/prisma";

async function main() {
  const { issues } = loadConfig({ requireDatabase: true });

  if (issues.length > 0) {
    throw new Error(`Supabase configuration invalid: ${issues.join(" ")}`);
  }

  const result = await prisma.$queryRaw<Array<{ ok: number }>>`select 1 as ok`;
  console.log(`Supabase Session Pooler OK: ${result[0]?.ok === 1 ? "connected" : "unknown response"}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
