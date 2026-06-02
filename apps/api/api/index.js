let handler;

try {
  const serverless = require("../dist/serverless");
  handler = serverless.default || serverless.handler || serverless;
} catch (error) {
  handler = (_req, res) => {
    const message = error instanceof Error ? error.message : "Unknown API boot error";

    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        status: "error",
        code: "API_BOOT_FAILED",
        message: "API failed to load its serverless bundle.",
        detail: message
      })
    );
  };
}

module.exports = handler;
