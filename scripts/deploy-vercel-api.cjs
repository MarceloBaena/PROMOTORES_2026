const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, ".vercel", "output");
const staticDir = path.join(outputDir, "static");
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const shouldUseShell = process.platform === "win32";

function runStep(label, args) {
  console.log(`\n[api:deploy:prod] ${label}`);
  const result = spawnSync(npxCommand, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: shouldUseShell,
    env: process.env
  });

  if (result.error) {
    console.error(`[api:deploy:prod] Falha ao executar ${label}:`, result.error.message);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  console.log("[api:deploy:prod] .vercel/output removido antes do build da API.");
}

runStep("Gerando prebuilt limpo da API", [
  "--yes",
  "vercel",
  "build",
  "--prod",
  "--yes",
  "--project",
  "promotores-2026-api",
  "--scope",
  "marcelobaenas-projects",
  "--local-config",
  "vercel.api.json"
]);

if (fs.existsSync(staticDir)) {
  fs.rmSync(staticDir, { recursive: true, force: true });
  console.log("[api:deploy:prod] Pasta .vercel/output/static removida para evitar HTML do painel no dominio da API.");
}

runStep("Publicando prebuilt da API em producao", [
  "--yes",
  "vercel",
  "deploy",
  "--prebuilt",
  "--prod",
  "--yes",
  "--project",
  "promotores-2026-api",
  "--scope",
  "marcelobaenas-projects",
  "--local-config",
  "vercel.api.json"
]);
