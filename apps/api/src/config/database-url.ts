export interface DatabaseUrlValidation {
  ok: boolean;
  message?: string;
  warnings: string[];
}

export interface DatabaseUrlValidationOptions {
  mode?: "supabase_pooler" | "standard";
  allowLoopback?: boolean;
}

export function validateDatabaseUrl(
  raw: string | undefined,
  options: DatabaseUrlValidationOptions = {}
): DatabaseUrlValidation {
  const mode = options.mode ?? "supabase_pooler";
  const allowLoopback = options.allowLoopback ?? false;

  if (!raw) {
    return {
      ok: false,
      message: "DATABASE_URL is required.",
      warnings: []
    };
  }

  if (/^https?:\/\//i.test(raw)) {
    return {
      ok: false,
      message: "DATABASE_URL must be a postgres:// URL, never https://.",
      warnings: []
    };
  }

  if (!allowLoopback && /localhost|127\.0\.0\.1|\[::1\]|::1/i.test(raw)) {
    return {
      ok: false,
      message:
        mode === "supabase_pooler"
          ? "DATABASE_URL must use Supabase Session Pooler, not localhost or loopback."
          : "DATABASE_URL must use a reachable PostgreSQL host or Docker service name, not localhost or loopback.",
      warnings: []
    };
  }

  if (
    /PROJECT_REF|SENHA|PASSWORD|USUARIO|HOST-POOLER-SUPABASE|REGION|<DB_PASSWORD>|<DB_HOST>|<DB_USER>|<DB_NAME>/i.test(
      raw
    )
  ) {
    return {
      ok: false,
      message:
        mode === "supabase_pooler"
          ? "DATABASE_URL still contains placeholders. Copy the real Supabase Session Pooler connection string from the Supabase dashboard."
          : "DATABASE_URL still contains placeholders. Replace the example values with the real PostgreSQL connection string.",
      warnings: []
    };
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      message: "DATABASE_URL is malformed.",
      warnings: []
    };
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    return {
      ok: false,
      message: "DATABASE_URL must start with postgres:// or postgresql://.",
      warnings: []
    };
  }

  const warnings: string[] = [];
  const hasUsername = url.username.trim().length > 0;
  const hasPassword = url.password.trim().length > 0;
  const hasHost = url.hostname.trim().length > 0;
  const hasDatabase = url.pathname.trim().length > 1;

  if (!hasUsername || !hasPassword || !hasHost || !hasDatabase) {
    return {
      ok: false,
      message: "DATABASE_URL must include user, password, host and database name.",
      warnings: []
    };
  }

  if (mode === "standard") {
    if (!url.port) {
      warnings.push("DATABASE_URL does not declare a port. PostgreSQL usually uses 5432.");
    }

    return {
      ok: true,
      warnings
    };
  }

  if (url.hostname.endsWith(".supabase.co")) {
    return {
      ok: false,
      message: "Use the Supabase Session Pooler host, not db.PROJECT_REF.supabase.co.",
      warnings: []
    };
  }

  if (!url.hostname.endsWith("pooler.supabase.com")) {
    return {
      ok: false,
      message: "DATABASE_URL must point to a Supabase Session Pooler host ending in pooler.supabase.com.",
      warnings: []
    };
  }

  if (url.port !== "5432") {
    warnings.push("Supabase Session Pooler must use port 5432 for this project.");
  }

  if (!url.username.startsWith("postgres.")) {
    warnings.push("Supabase pooler usernames usually look like postgres.PROJECT_REF.");
  }

  return {
    ok: true,
    warnings
  };
}
