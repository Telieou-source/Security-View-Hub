import express, { type Express } from "express";
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

// In production (pre-built distribution), serve the bundled React frontend
// from the ./public/ directory that sits alongside this server bundle.
if (process.env.NODE_ENV === "production") {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.join(moduleDir, "public");
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: "index.html" }));
    // SPA catch-all — React Router handles client-side navigation
    app.get("*", (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }
}

export default app;
