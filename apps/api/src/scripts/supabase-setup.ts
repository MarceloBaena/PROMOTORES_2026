import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadConfig } from "../config/env";
import { prisma } from "../lib/prisma";
import { bootstrapAccess } from "../services/bootstrap";

async function main() {
  const { config, issues } = loadConfig({ requireDatabase: true });

  if (!config || issues.length > 0) {
    throw new Error(`Supabase configuration invalid: ${issues.join(" ")}`);
  }

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(command, ["prisma", "migrate", "deploy"], {
    cwd: path.resolve(__dirname, "../.."),
    env: process.env,
    stdio: "inherit"
  });

  const result = await bootstrapAccess({
    resetPasswords: config.BOOTSTRAP_RESET_PASSWORDS
  });

  console.log(`Supabase setup completed: ${result.users.join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
