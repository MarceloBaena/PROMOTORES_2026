import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { AppError } from "../lib/errors";
import { loadConfig } from "../config/env";

const uploadRoot = path.resolve(process.cwd(), "uploads");

function ensureUploadRoot() {
  if (!fs.existsSync(uploadRoot)) {
    fs.mkdirSync(uploadRoot, { recursive: true });
  }
}

const localStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    ensureUploadRoot();
    callback(null, uploadRoot);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname);
    callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`);
  }
});

export const upload = multer({
  storage: localStorage,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

export function publicUploadUrl(filename: string) {
  const { config } = loadConfig();

  if (config?.UPLOAD_DRIVER === "s3") {
    throw new AppError(501, "S3_UPLOAD_NOT_CONFIGURED", "S3 upload driver is selected but no S3 adapter is configured yet.");
  }

  const baseUrl = config?.UPLOAD_BASE_URL?.replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/uploads/${filename}` : `/uploads/${filename}`;
}
