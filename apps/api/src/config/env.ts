import "dotenv/config";
import { z } from "zod";
import { validateDatabaseUrl } from "./database-url";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return value;
}, z.boolean());

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().optional(),
  DATABASE_URL_MODE: z.enum(["supabase_pooler", "standard"]).default("supabase_pooler"),
  JWT_ACCESS_SECRET: z.string().min(17, "JWT_ACCESS_SECRET must have more than 16 characters."),
  JWT_REFRESH_SECRET: z.string().min(17, "JWT_REFRESH_SECRET must have more than 16 characters."),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("*"),
  UPLOAD_DRIVER: z.enum(["local", "s3"]).default("local"),
  UPLOAD_BASE_URL: z.string().optional(),
  STARTUP_DATABASE_SETUP: booleanFromEnv.default(false),
  BOOTSTRAP_RESET_PASSWORDS: booleanFromEnv.default(false),
  BOOTSTRAP_MULTI_COMPANY_DEMO: booleanFromEnv.default(false)
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(options: { requireDatabase?: boolean } = {}) {
  const parsed = configSchema.safeParse(process.env);
  const issues: string[] = [];

  if (!parsed.success) {
    issues.push(...parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }

  const config = parsed.success ? parsed.data : undefined;

  if (config?.DATABASE_URL || options.requireDatabase) {
    const database = validateDatabaseUrl(config?.DATABASE_URL, {
      mode: config?.DATABASE_URL_MODE
    });

    if (!database.ok) {
      issues.push(database.message ?? "Invalid DATABASE_URL.");
    }

    issues.push(...database.warnings);
  }

  return {
    config,
    issues
  };
}

export function requireConfig(options: { requireDatabase?: boolean } = {}): AppConfig {
  const { config, issues } = loadConfig(options);

  if (!config || issues.length > 0) {
    throw new Error(issues.join(" "));
  }

  return config;
}
