const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const runtimeDir = path.join(rootDir, "api_runtime");
const copies = [
  {
    source: path.join(rootDir, "apps", "api", "dist"),
    target: path.join(runtimeDir, "dist")
  },
  {
    source: path.join(rootDir, "apps", "api", "prisma"),
    target: path.join(runtimeDir, "prisma")
  }
];

const legacyTargets = [
  path.join(rootDir, "api", "dist"),
  path.join(rootDir, "api", "prisma")
];

for (const legacyTarget of legacyTargets) {
  fs.rmSync(legacyTarget, { recursive: true, force: true });
}

for (const { source, target } of copies) {
  if (!fs.existsSync(source)) {
    throw new Error(`Nao foi possivel preparar a funcao da API. Pasta ausente: ${source}`);
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

console.log("[prepare-vercel-api] bundle da API copiado para api_runtime/dist e api_runtime/prisma");
