import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadConfig } from "./config/env";
import { validateDatabaseUrl } from "./config/database-url";
import { logger } from "./lib/logger";
import { bootstrapAccess } from "./services/bootstrap";

type BootStatus = "idle" | "running" | "ok" | "error";

const bootState: {
  status: BootStatus;
  message?: string;
  issues: string[];
  startedAt?: string;
  finishedAt?: string;
} = {
  status: "idle",
  issues: []
};

export function getBootState() {
  return bootState;
}

export function collectBootIssues() {
  const issues: string[] = [];
  const { config, issues: configIssues } = loadConfig({ requireDatabase: true });
  issues.push(...configIssues);

  if (config?.STARTUP_DATABASE_SETUP && !process.env.DATABASE_URL) {
    issues.push("STARTUP_DATABASE_SETUP=true requires DATABASE_URL.");
  }

  return issues;
}

function runMigrateDeploy() {
  const cwd = path.resolve(__dirname, "..");
  const command = process.platform === "win32" ? "npx.cmd" : "npx";

  execFileSync(command, ["prisma", "migrate", "deploy"], {
    cwd,
    env: process.env,
    stdio: "pipe"
  });
}

export function startDatabaseSetupIfEnabled() {
  const { config } = loadConfig();

  if (!config?.STARTUP_DATABASE_SETUP || bootState.status === "running" || bootState.status === "ok") {
    return;
  }

  bootState.status = "running";
  bootState.startedAt = new Date().toISOString();
  bootState.issues = [];

  Promise.resolve()
    .then(() => {
      const validation = validateDatabaseUrl(process.env.DATABASE_URL);

      if (!validation.ok) {
        throw new Error(validation.message ?? "Invalid DATABASE_URL.");
      }

      runMigrateDeploy();

      return bootstrapAccess({
        resetPasswords: config.BOOTSTRAP_RESET_PASSWORDS
      });
    })
    .then((result) => {
      bootState.status = "ok";
      bootState.message = `Database setup completed for ${result.users.join(", ")}.`;
      bootState.finishedAt = new Date().toISOString();
      logger.info({ result }, "startup database setup completed");
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown startup setup error.";
      bootState.status = "error";
      bootState.message = message;
      bootState.issues = [message];
      bootState.finishedAt = new Date().toISOString();
      logger.error({ err: error }, "startup database setup failed");
    });
}
