import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clinicSettingsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../lib/session";

const router: IRouter = Router();

const DEFAULT_CLINIC_NAME = "HealthNexus Medical Center";
const MAX_LOGO_BASE64_LEN = 1_500_000; // ~1 MB raw file

// GET /settings — public, no auth required (login page needs it too)
router.get("/settings", async (req, res): Promise<void> => {
  try {
    const [s] = await db.select().from(clinicSettingsTable).limit(1);
    if (!s) {
      res.json({ clinicName: DEFAULT_CLINIC_NAME, logoBase64: null });
      return;
    }
    res.json({ clinicName: s.clinicName, logoBase64: s.logoBase64 ?? null });
  } catch {
    res.json({ clinicName: DEFAULT_CLINIC_NAME, logoBase64: null });
  }
});

// PATCH /settings — doctor or receptionist only
router.patch(
  "/settings",
  requireAuth,
  requireRole("doctor", "receptionist"),
  async (req, res): Promise<void> => {
    const { clinicName, logoBase64 } = req.body as {
      clinicName?: string;
      logoBase64?: string | null;
    };

    if (
      clinicName !== undefined &&
      (typeof clinicName !== "string" || clinicName.trim().length === 0)
    ) {
      res.status(400).json({ error: "clinicName must be a non-empty string" });
      return;
    }

    if (logoBase64 !== undefined && logoBase64 !== null) {
      if (typeof logoBase64 !== "string") {
        res.status(400).json({ error: "logoBase64 must be a string or null" });
        return;
      }
      if (logoBase64.length > MAX_LOGO_BASE64_LEN) {
        res.status(400).json({ error: "Logo too large — maximum file size is 1 MB" });
        return;
      }
      if (!logoBase64.startsWith("data:image/png") && !logoBase64.startsWith("data:image/jpeg")) {
        res.status(400).json({ error: "Logo must be a PNG or JPEG image" });
        return;
      }
    }

    const [existing] = await db.select().from(clinicSettingsTable).limit(1);

    if (existing) {
      const [updated] = await db
        .update(clinicSettingsTable)
        .set({
          clinicName:
            clinicName !== undefined ? clinicName.trim() : existing.clinicName,
          logoBase64:
            logoBase64 !== undefined ? logoBase64 : existing.logoBase64,
        })
        .where(eq(clinicSettingsTable.id, existing.id))
        .returning();
      res.json({
        clinicName: updated.clinicName,
        logoBase64: updated.logoBase64 ?? null,
      });
    } else {
      const [inserted] = await db
        .insert(clinicSettingsTable)
        .values({
          clinicName: clinicName?.trim() ?? DEFAULT_CLINIC_NAME,
          logoBase64: logoBase64 ?? null,
        })
        .returning();
      res.json({
        clinicName: inserted.clinicName,
        logoBase64: inserted.logoBase64 ?? null,
      });
    }
  }
);

export default router;
