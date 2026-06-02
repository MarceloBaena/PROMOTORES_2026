import "dotenv/config";
import { loadConfig } from "../config/env";
import { prisma } from "../lib/prisma";
import { bootstrapAccess } from "../services/bootstrap";

async function main() {
  const { config, issues } = loadConfig({ requireDatabase: true });

  if (!config || issues.length > 0) {
    throw new Error(`Invalid API environment: ${issues.join(" ")}`);
  }

  const result = await bootstrapAccess({
    resetPasswords: config.BOOTSTRAP_RESET_PASSWORDS
  });

  console.log(`Bootstrap completed: ${result.users.join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
