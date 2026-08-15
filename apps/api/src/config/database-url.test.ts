import test from "node:test";
import assert from "node:assert/strict";
import { validateDatabaseUrl } from "./database-url";

test("aceita URL valida do Supabase Session Pooler", () => {
  const result = validateDatabaseUrl(
    "postgresql://postgres.abc123:segredo-forte@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
    { mode: "supabase_pooler" }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
});

test("aceita URL valida de PostgreSQL no VPS com hostname", () => {
  const result = validateDatabaseUrl("postgresql://promotor:segredo-forte@db.interno.vps.local:5433/promotorpro", {
    mode: "standard"
  });

  assert.equal(result.ok, true);
});

test("aceita URL PostgreSQL local de Docker no modo padrao standard", () => {
  const result = validateDatabaseUrl("postgresql://promotor:segredo-forte@db:5432/promotorpro");

  assert.equal(result.ok, true);
});

test("aceita URL valida de PostgreSQL no VPS com IP privado", () => {
  const result = validateDatabaseUrl("postgresql://promotor:segredo-forte@10.15.30.20:5432/promotorpro", {
    mode: "standard"
  });

  assert.equal(result.ok, true);
});

test("rejeita URL iniciada por https", () => {
  const result = validateDatabaseUrl("https://db.interno.vps.local/promotorpro", {
    mode: "standard"
  });

  assert.equal(result.ok, false);
  assert.match(result.message ?? "", /never https/i);
});

test("rejeita localhost quando inadequado para containerizacao", () => {
  const result = validateDatabaseUrl("postgresql://promotor:segredo-forte@localhost:5432/promotorpro", {
    mode: "standard"
  });

  assert.equal(result.ok, false);
  assert.match(result.message ?? "", /not localhost or loopback/i);
});

test("rejeita placeholder conhecido", () => {
  const password = "MinhaSenhaSuperSecreta123";
  const result = validateDatabaseUrl(
    `postgresql://promotor:${password}@HOST-POOLER-SUPABASE:5432/promotorpro?region=REGION`,
    {
      mode: "standard"
    }
  );

  assert.equal(result.ok, false);
  assert.match(result.message ?? "", /placeholders/i);
  assert.doesNotMatch(result.message ?? "", new RegExp(password, "i"));
});

test("rejeita protocolo invalido", () => {
  const result = validateDatabaseUrl("mysql://promotor:segredo-forte@db.interno.vps.local:5432/promotorpro", {
    mode: "standard"
  });

  assert.equal(result.ok, false);
  assert.match(result.message ?? "", /must start with postgres/i);
});

test("rejeita URL sem host", () => {
  const result = validateDatabaseUrl("postgresql://promotor:segredo-forte@:5432/promotorpro", {
    mode: "standard"
  });

  assert.equal(result.ok, false);
});

test("rejeita URL sem usuario, senha ou banco", () => {
  const result = validateDatabaseUrl("postgresql://db.interno.vps.local:5432/", {
    mode: "standard"
  });

  assert.equal(result.ok, false);
  assert.match(result.message ?? "", /user, password, host and database name/i);
});

test("modo Supabase falha quando a URL nao termina em pooler.supabase.com", () => {
  const result = validateDatabaseUrl("postgresql://promotor:segredo-forte@db.interno.vps.local:5432/promotorpro", {
    mode: "supabase_pooler"
  });

  assert.equal(result.ok, false);
  assert.match(result.message ?? "", /pooler\.supabase\.com/i);
});

test("nunca expõe a senha na mensagem de erro", () => {
  const password = "SenhaUltraSecreta987";
  const result = validateDatabaseUrl(`postgresql://promotor:${password}@localhost:5432/promotorpro`, {
    mode: "standard"
  });

  assert.equal(result.ok, false);
  assert.doesNotMatch(result.message ?? "", new RegExp(password, "i"));
});
