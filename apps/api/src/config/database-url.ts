export interface DatabaseUrlValidation {
  ok: boolean;
  message?: string;
  warnings: string[];
}

export function validateDatabaseUrl(raw: string | undefined): DatabaseUrlValidation {
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

  if (/localhost|127\.0\.0\.1|\[::1\]|::1/i.test(raw)) {
    return {
      ok: false,
      message: "DATABASE_URL must use Supabase Session Pooler, not localhost.",
      warnings: []
    };
  }

  if (/PROJECT_REF|SENHA|PASSWORD|REGION/i.test(raw)) {
    return {
      ok: false,
      message: "DATABASE_URL still contains placeholders. Copy the real Supabase Session Pooler connection string from the Supabase dashboard.",
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

  const warnings: string[] = [];

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
