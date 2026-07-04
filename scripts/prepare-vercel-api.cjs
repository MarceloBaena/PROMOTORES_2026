const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const copies = [
  {
    source: path.join(rootDir, "apps", "api", "dist"),
    target: path.join(rootDir, "api", "dist")
  },
  {
    source: path.join(rootDir, "apps", "api", "prisma"),
    target: path.join(rootDir, "api", "prisma")
  }
];

for (const { source, target } of copies) {
  if (!fs.existsSync(source)) {
    throw new Error(`Nao foi possivel preparar a funcao da API. Pasta ausente: ${source}`);
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

console.log("[prepare-vercel-api] bundle da API copiado para api/dist e api/prisma");
