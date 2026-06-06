import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clinicSettingsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../lib/session";

const router: IRouter = Router();

const DEFAULT_CLINIC_NAME = "HealthNexus Medical Center";
const MAX_LOGO_BASE64_LEN = 1_500_000; // ~1 MB raw file

type SettingsRow = typeof clinicSettingsTable.$inferSelect;

function rowToJson(s: SettingsRow) {
  return {
    clinicName: s.clinicName,
    logoBase64: s.logoBase64 ?? null,
    address: s.address ?? null,
    city: s.city ?? null,
    country: s.country ?? null,
    latitude:  s.latitude  != null ? parseFloat(s.latitude)  : null,
    longitude: s.longitude != null ? parseFloat(s.longitude) : null,
  };
}

const EMPTY_DEFAULTS = {
  clinicName: DEFAULT_CLINIC_NAME,
  logoBase64: null,
  address: null,
  city: null,
  country: null,
  latitude: null,
  longitude: null,
};

// ── GET /settings — public, no auth required (login page needs it too) ────────
router.get("/settings", async (req, res): Promise<void> => {
  try {
    const [s] = await db.select().from(clinicSettingsTable).limit(1);
    res.json(s ? rowToJson(s) : EMPTY_DEFAULTS);
  } catch {
    res.json(EMPTY_DEFAULTS);
  }
});

// ── PATCH /settings — doctor or receptionist only ─────────────────────────────
router.patch(
  "/settings",
  requireAuth,
  requireRole("doctor", "receptionist"),
  async (req, res): Promise<void> => {
    const {
      clinicName,
      logoBase64,
      address,
      city,
      country,
      latitude,
      longitude,
    } = req.body as {
      clinicName?: string;
      logoBase64?: string | null;
      address?: string | null;
      city?: string | null;
      country?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };

    // — Validate name
    if (clinicName !== undefined && (typeof clinicName !== "string" || clinicName.trim().length === 0)) {
      res.status(400).json({ error: "clinicName must be a non-empty string" });
      return;
    }

    // — Validate logo
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

    // — Validate coordinates
    if (latitude !== undefined && latitude !== null) {
      if (typeof latitude !== "number" || isNaN(latitude) || latitude < -90 || latitude > 90) {
        res.status(400).json({ error: "latitude must be a number between -90 and 90" });
        return;
      }
    }
    if (longitude !== undefined && longitude !== null) {
      if (typeof longitude !== "number" || isNaN(longitude) || longitude < -180 || longitude > 180) {
        res.status(400).json({ error: "longitude must be a number between -180 and 180" });
        return;
      }
    }

    const [existing] = await db.select().from(clinicSettingsTable).limit(1);

    const toSet = {
      ...(clinicName  !== undefined ? { clinicName: clinicName.trim() } : {}),
      ...(logoBase64  !== undefined ? { logoBase64 } : {}),
      ...(address     !== undefined ? { address: address?.trim() ?? null } : {}),
      ...(city        !== undefined ? { city: city?.trim() ?? null } : {}),
      ...(country     !== undefined ? { country: country?.trim() ?? null } : {}),
      ...(latitude    !== undefined ? { latitude:  latitude  != null ? String(latitude)  : null } : {}),
      ...(longitude   !== undefined ? { longitude: longitude != null ? String(longitude) : null } : {}),
    };

    if (existing) {
      const [updated] = await db
        .update(clinicSettingsTable)
        .set(toSet)
        .where(eq(clinicSettingsTable.id, existing.id))
        .returning();
      res.json(rowToJson(updated));
    } else {
      const [inserted] = await db
        .insert(clinicSettingsTable)
        .values({
          clinicName: clinicName?.trim() ?? DEFAULT_CLINIC_NAME,
          logoBase64: logoBase64 ?? null,
          address: address?.trim() ?? null,
          city: city?.trim() ?? null,
          country: country?.trim() ?? null,
          latitude:  latitude  != null ? String(latitude)  : null,
          longitude: longitude != null ? String(longitude) : null,
        })
        .returning();
      res.json(rowToJson(inserted));
    }
  }
);

export default router;
