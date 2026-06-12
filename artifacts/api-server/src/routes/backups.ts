import { Router, type IRouter } from "express";
import { requireAuth, requireRole } from "../lib/session";
import {
  createBackup,
  listBackups,
  getBackup,
  getBackupFilePath,
  deleteBackup,
  restoreBackup,
} from "../lib/backup";

const router: IRouter = Router();

// Only admin role can access all backup endpoints
const adminOnly = requireRole("admin");

// ── GET /backups — list all backups ──────────────────────────────────────────
router.get("/backups", requireAuth, adminOnly, async (_req, res): Promise<void> => {
  try {
    const backups = await listBackups();
    res.json(backups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /backups — create manual backup ─────────────────────────────────────
router.post("/backups", requireAuth, adminOnly, async (_req, res): Promise<void> => {
  try {
    const meta = await createBackup("manual");
    res.status(meta.status === "ok" ? 201 : 500).json(meta);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /backups/:id — get metadata for one backup ────────────────────────────
router.get("/backups/:id", requireAuth, adminOnly, async (req, res): Promise<void> => {
  const meta = await getBackup(String(req.params.id));
  if (!meta) { res.status(404).json({ error: "Backup not found" }); return; }
  res.json(meta);
});

// ── GET /backups/:id/download — download the SQL dump ─────────────────────────
router.get("/backups/:id/download", requireAuth, adminOnly, async (req, res): Promise<void> => {
  const meta = await getBackup(String(req.params.id));
  if (!meta) { res.status(404).json({ error: "Backup not found" }); return; }

  const filePath = await getBackupFilePath(String(req.params.id));
  if (!filePath) { res.status(404).json({ error: "Backup file missing" }); return; }

  const filename = `clinicflow_backup_${new Date(meta.createdAt).toISOString().slice(0, 10)}_${String(req.params.id).slice(-8)}.sql`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/sql");
  res.sendFile(filePath);
});

// ── POST /backups/:id/restore — restore from a backup ─────────────────────────
router.post("/backups/:id/restore", requireAuth, adminOnly, async (req, res): Promise<void> => {
  const meta = await getBackup(String(req.params.id));
  if (!meta) { res.status(404).json({ error: "Backup not found" }); return; }
  if (meta.status !== "ok") {
    res.status(400).json({ error: "Cannot restore from a failed backup" });
    return;
  }

  try {
    const result = await restoreBackup(String(req.params.id));
    res.status(result.ok ? 200 : 500).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /backups/:id — delete a backup ─────────────────────────────────────
router.delete("/backups/:id", requireAuth, adminOnly, async (req, res): Promise<void> => {
  const meta = await getBackup(String(req.params.id));
  if (!meta) { res.status(404).json({ error: "Backup not found" }); return; }

  await deleteBackup(String(req.params.id));
  res.json({ ok: true });
});

export default router;
