import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadConfig } from "../config/env";
import { prisma } from "../lib/prisma";
import { bootstrapAccess } from "../services/bootstrap";

async function main() {
  const { config, issues } = loadConfig({ requireDatabase: true });

  if (!config || issues.length > 0) {
    throw new Error(`Database configuration invalid: ${issues.join(" ")}`);
  }

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(command, ["prisma", "migrate", "deploy"], {
    cwd: path.resolve(__dirname, "../.."),
    env: process.env,
    stdio: "inherit"
  });

  const result = await bootstrapAccess({
    resetPasswords: config.BOOTSTRAP_RESET_PASSWORDS,
    includeMultiCompanyDemo: config.BOOTSTRAP_MULTI_COMPANY_DEMO
  });

  const label = config.DATABASE_URL_MODE === "supabase_pooler" ? "Supabase setup" : "PostgreSQL setup";
  console.log(
    `${label} completed: ${result.users.join(", ")} | Empresas: ${result.companies.join(", ")} | Demo multiempresa: ${
      result.includeMultiCompanyDemo ? "ativo" : "desligado"
    }`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
