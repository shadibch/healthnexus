import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

// ── Storage directory ─────────────────────────────────────────────────────────
// Stored under /tmp/clinicflow-backups so it survives process restarts but is
// NOT committed to the repo. For production, swap this for object storage.
const BACKUP_DIR = process.env.BACKUP_DIR ?? "/tmp/clinicflow-backups";
const MAX_BACKUPS = 30; // keep last 30 daily snapshots

export interface BackupMeta {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;          // ISO timestamp
  trigger: "scheduled" | "manual";
  status: "ok" | "failed";
  errorMessage?: string;
}

async function ensureDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

function metaPath(id: string) {
  return path.join(BACKUP_DIR, `${id}.meta.json`);
}
function dumpPath(id: string) {
  return path.join(BACKUP_DIR, `${id}.sql`);
}

async function writeMeta(meta: BackupMeta) {
  await fs.writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2), "utf8");
}

// ── Create a backup ───────────────────────────────────────────────────────────
export async function createBackup(trigger: "scheduled" | "manual"): Promise<BackupMeta> {
  await ensureDir();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const id = `backup_${Date.now()}`;
  const file = dumpPath(id);

  logger.info({ id, trigger }, "Starting database backup");

  let meta: BackupMeta = {
    id,
    filename: `${id}.sql`,
    sizeBytes: 0,
    createdAt: new Date().toISOString(),
    trigger,
    status: "ok",
  };

  try {
    // pg_dump with plain SQL format — human-readable and restorable via psql
    await execFileAsync("pg_dump", [
      "--no-password",
      "--format=plain",
      "--if-exists",
      "--clean",
      "--no-owner",
      "--no-acl",
      dbUrl,
    ], {
      env: { ...process.env, PGPASSWORD: extractPassword(dbUrl) },
      maxBuffer: 512 * 1024 * 1024,  // 512 MB
    }).then(({ stdout }) => fs.writeFile(file, stdout, "utf8"));

    const stat = await fs.stat(file);
    meta.sizeBytes = stat.size;
    logger.info({ id, sizeBytes: stat.size }, "Backup completed");
  } catch (err: any) {
    meta.status = "failed";
    meta.errorMessage = err.message ?? String(err);
    logger.error({ id, err }, "Backup failed");
  }

  await writeMeta(meta);
  await pruneOldBackups();
  return meta;
}

// ── List backups ──────────────────────────────────────────────────────────────
export async function listBackups(): Promise<BackupMeta[]> {
  await ensureDir();
  const files = await fs.readdir(BACKUP_DIR);
  const metaFiles = files.filter(f => f.endsWith(".meta.json"));

  const metas = await Promise.all(
    metaFiles.map(async (f) => {
      try {
        const raw = await fs.readFile(path.join(BACKUP_DIR, f), "utf8");
        return JSON.parse(raw) as BackupMeta;
      } catch {
        return null;
      }
    })
  );

  return (metas.filter(Boolean) as BackupMeta[])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ── Get one backup ────────────────────────────────────────────────────────────
export async function getBackup(id: string): Promise<BackupMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(id), "utf8");
    return JSON.parse(raw) as BackupMeta;
  } catch {
    return null;
  }
}

// ── Get dump file path ────────────────────────────────────────────────────────
export async function getBackupFilePath(id: string): Promise<string | null> {
  const file = dumpPath(id);
  try {
    await fs.access(file);
    return file;
  } catch {
    return null;
  }
}

// ── Delete a backup ───────────────────────────────────────────────────────────
export async function deleteBackup(id: string): Promise<boolean> {
  try {
    await Promise.allSettled([
      fs.unlink(dumpPath(id)),
      fs.unlink(metaPath(id)),
    ]);
    return true;
  } catch {
    return false;
  }
}

// ── Restore a backup ──────────────────────────────────────────────────────────
export async function restoreBackup(id: string): Promise<{ ok: boolean; message: string }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const file = dumpPath(id);
  try {
    await fs.access(file);
  } catch {
    return { ok: false, message: "Backup file not found" };
  }

  logger.warn({ id }, "Starting database restore — this overwrites all data");

  try {
    // Parse the DB URL to get the database name for psql
    const parsed = new URL(dbUrl);
    const dbName = parsed.pathname.slice(1);

    await execFileAsync("psql", [
      "--no-password",
      "--quiet",
      "--file", file,
      dbUrl,
    ], {
      env: { ...process.env, PGPASSWORD: extractPassword(dbUrl) },
      maxBuffer: 512 * 1024 * 1024,
    });

    logger.info({ id, dbName }, "Database restore completed");
    return { ok: true, message: `Database restored from backup ${id}` };
  } catch (err: any) {
    logger.error({ id, err }, "Database restore failed");
    return { ok: false, message: err.message ?? String(err) };
  }
}

// ── Prune oldest backups beyond MAX_BACKUPS ───────────────────────────────────
async function pruneOldBackups() {
  const all = await listBackups();
  if (all.length <= MAX_BACKUPS) return;

  const toDelete = all.slice(MAX_BACKUPS);
  await Promise.allSettled(toDelete.map(b => deleteBackup(b.id)));
  logger.info({ pruned: toDelete.length }, "Pruned old backups");
}

// ── Parse password from connection string ─────────────────────────────────────
function extractPassword(dbUrl: string): string {
  try {
    return new URL(dbUrl).password ?? "";
  } catch {
    return "";
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
let schedulerStarted = false;

export async function startBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Dynamic import so we don't break if node-cron isn't installed
  const { default: cron } = await import("node-cron");

  // Daily at 02:00 AM server time
  cron.schedule("0 2 * * *", async () => {
    logger.info("Running scheduled daily backup");
    try {
      const meta = await createBackup("scheduled");
      logger.info({ id: meta.id, status: meta.status }, "Scheduled backup finished");
    } catch (err) {
      logger.error({ err }, "Scheduled backup threw unexpectedly");
    }
  });

  logger.info("Daily backup scheduler started (runs at 02:00 AM)");
}
