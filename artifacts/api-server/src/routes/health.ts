import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { sql } from "drizzle-orm";
import { db, logger } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    // Fail health checks until the database is reachable AND the schema
    // (users table) exists, so platforms like Render never route traffic
    // to a half-migrated instance.
    await db.execute(sql`select 1 from "users" limit 1`);
    res.json(HealthCheckResponse.parse({ status: "ok" }));
  } catch (err) {
    reqLog.error({ err }, "healthz failed");
    res.status(503).json({ status: "error" });
  }
});

const reqLog = logger.child({ module: "health" });

export default router;
