import fs from "node:fs";
import { Router } from "express";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/async-handler";
import { AppError } from "../lib/errors";
import { upload } from "../services/uploads";

export const clientsRouter = Router();

const clientSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(2),
  document: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional()
});

clientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const clients = await prisma.client.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } }
            ]
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 200
    });

    res.json({ data: clients });
  })
);

clientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = clientSchema.parse(req.body);
    const client = await prisma.client.create({
      data: {
        ...input,
        status: input.status ?? "ACTIVE",
        latitude: input.latitude,
        longitude: input.longitude
      }
    });

    res.status(201).json({ data: client });
  })
);

clientsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = clientSchema.partial().parse(req.body);
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: input
    });

    res.json({ data: client });
  })
);

clientsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.client.update({
      where: { id: req.params.id },
      data: { status: "ARCHIVED" }
    });

    res.status(204).send();
  })
);

clientsRouter.post(
  "/import-csv",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, "CSV_FILE_REQUIRED", "CSV file is required.");
    }

    const content = fs.readFileSync(req.file.path, "utf8");
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as Array<Record<string, string>>;

    let importedRows = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (const [index, row] of records.entries()) {
      try {
        const name = row.name || row.nome || row.cliente;

        if (!name) {
          throw new Error("Missing client name.");
        }

        const code = row.code || row.codigo || `CSV-${Date.now()}-${index}`;

        await prisma.client.upsert({
          where: { code },
          create: {
            code,
            name,
            document: row.document || row.documento || undefined,
            address: row.address || row.endereco || undefined,
            city: row.city || row.cidade || undefined,
            state: row.state || row.uf || undefined,
            status: "ACTIVE"
          },
          update: {
            name,
            document: row.document || row.documento || undefined,
            address: row.address || row.endereco || undefined,
            city: row.city || row.cidade || undefined,
            state: row.state || row.uf || undefined,
            status: "ACTIVE"
          }
        });

        importedRows += 1;
      } catch (error) {
        errors.push({
          row: index + 2,
          message: error instanceof Error ? error.message : "Unknown import error."
        });
      }
    }

    const log = await prisma.clientImportLog.create({
      data: {
        fileName: req.file.originalname,
        status: errors.length === 0 ? "SUCCESS" : importedRows > 0 ? "PARTIAL" : "FAILED",
        totalRows: records.length,
        importedRows,
        failedRows: errors.length,
        errors,
        preview: records.slice(0, 5),
        createdById: req.user?.id
      }
    });

    res.status(201).json({ data: log });
  })
);
