import { createApp } from "./app";
import { loadConfig } from "./config/env";
import { logger } from "./lib/logger";

const { config } = loadConfig();
const port = config?.PORT ?? 3000;
const app = createApp();

app.listen(port, () => {
  logger.info({ port }, "Sales Promoters API listening");
});
