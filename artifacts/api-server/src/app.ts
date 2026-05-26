import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);

// Global error handler — logs the real cause (e.g. pg errors wrapped by Drizzle)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const cause = err instanceof Error ? (err.cause as Error | undefined) : undefined;
  logger.error({
    err,
    cause: cause ? { message: cause.message, code: (cause as NodeJS.ErrnoException).code } : undefined,
    req: { method: req.method, url: req.url },
  }, "unhandled error");
  const message = cause?.message ?? (err instanceof Error ? err.message : "Internal Server Error");
  res.status(500).json({ error: message });
});

// In production (pre-built distribution), serve the bundled React frontend
// from the ./public/ directory that sits alongside this server bundle.
if (process.env.NODE_ENV === "production") {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.join(moduleDir, "public");
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: "index.html" }));
    // SPA catch-all — React Router handles client-side navigation
    app.get("*splat", (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }
}

export default app;
