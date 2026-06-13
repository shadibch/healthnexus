import { Router, type IRouter } from "express";
import { sql, eq, inArray } from "drizzle-orm";
import { db, prescriptionsTable, prescriptionItemsTable } from "@workspace/db";
import { requireAuth, getSessionUser } from "../lib/session";

const router: IRouter = Router();

const DEFAULT_LAT = 24.4539;
const DEFAULT_LNG = 54.3773;

function parseLoc(req: any): { lat: number; lng: number } {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  return {
    lat: isNaN(lat) ? DEFAULT_LAT : lat,
    lng: isNaN(lng) ? DEFAULT_LNG : lng,
  };
}

// GET /map/doctors?lat=X&lng=Y&limit=10
router.get("/map/doctors", requireAuth, async (req, res): Promise<void> => {
  const { lat, lng } = parseLoc(req);
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);

  const result = await db.execute(sql`
    SELECT
      id, first_name, last_name, specialization, phone, email,
      is_available, CAST(consultation_fee AS FLOAT) AS consultation_fee,
      bio, clinic_address,
      CAST(latitude AS FLOAT) AS latitude,
      CAST(longitude AS FLOAT) AS longitude,
      ROUND(CAST(
        6371 * acos(LEAST(1.0,
          cos(radians(${lat})) * cos(radians(CAST(latitude AS FLOAT))) *
          cos(radians(CAST(longitude AS FLOAT)) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(CAST(latitude AS FLOAT)))
        ))
      AS NUMERIC), 2) AS distance_km
    FROM doctors
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY distance_km ASC
    LIMIT ${limit}
  `);

  res.json(result.rows);
});

// GET /map/pharmacies?lat=X&lng=Y&limit=20
router.get("/map/pharmacies", requireAuth, async (req, res): Promise<void> => {
  const { lat, lng } = parseLoc(req);
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 30);

  const result = await db.execute(sql`
    SELECT
      id, name, address, phone, is_open_24h,
      CAST(latitude AS FLOAT) AS latitude,
      CAST(longitude AS FLOAT) AS longitude,
      ROUND(CAST(
        6371 * acos(LEAST(1.0,
          cos(radians(${lat})) * cos(radians(CAST(latitude AS FLOAT))) *
          cos(radians(CAST(longitude AS FLOAT)) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(CAST(latitude AS FLOAT)))
        ))
      AS NUMERIC), 2) AS distance_km
    FROM pharmacies
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY distance_km ASC
    LIMIT ${limit}
  `);

  res.json(result.rows);
});

// GET /map/pharmacies/check-meds?medicationIds=1,2,3&lat=X&lng=Y
// Returns ALL pharmacies with availability info for each requested medication
router.get("/map/pharmacies/check-meds", requireAuth, async (req, res): Promise<void> => {
  const { lat, lng } = parseLoc(req);
  const rawIds = (req.query.medicationIds as string) ?? "";
  const medIds = rawIds
    .split(",")
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n) && n > 0);

  if (medIds.length === 0) {
    res.status(400).json({ error: "medicationIds is required (comma-separated)" });
    return;
  }

  const totalRequested = medIds.length;

  // Use sql array literal
  const idsArray = `{${medIds.join(",")}}`;

  const result = await db.execute(sql`
    SELECT
      ph.id,
      ph.name,
      ph.address,
      ph.phone,
      ph.is_open_24h,
      CAST(ph.latitude AS FLOAT) AS latitude,
      CAST(ph.longitude AS FLOAT) AS longitude,
      ROUND(CAST(
        6371 * acos(LEAST(1.0,
          cos(radians(${lat})) * cos(radians(CAST(ph.latitude AS FLOAT))) *
          cos(radians(CAST(ph.longitude AS FLOAT)) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(CAST(ph.latitude AS FLOAT)))
        ))
      AS NUMERIC), 2) AS distance_km,
      COALESCE(inv.available_count, 0)::int AS available_count,
      COALESCE(inv.available_ids, ARRAY[]::int[]) AS available_ids,
      ${totalRequested}::int AS total_requested
    FROM pharmacies ph
    LEFT JOIN (
      SELECT
        pharmacy_id,
        COUNT(*)::int AS available_count,
        array_agg(medication_id::int) AS available_ids
      FROM pharmacy_inventory
      WHERE medication_id = ANY(${idsArray}::int[])
        AND in_stock = true
        AND quantity > 0
      GROUP BY pharmacy_id
    ) inv ON inv.pharmacy_id = ph.id
    WHERE ph.latitude IS NOT NULL AND ph.longitude IS NOT NULL
    ORDER BY inv.available_count DESC NULLS LAST, distance_km ASC
  `);

  const rows = result.rows.map((r: any) => ({
    ...r,
    hasAll: r.available_count >= totalRequested,
    hasSome: r.available_count > 0 && r.available_count < totalRequested,
    hasNone: r.available_count === 0,
    missingIds: medIds.filter((id) => !(r.available_ids as number[]).includes(id)),
  }));

  res.json(rows);
});

// GET /map/prescription/:id/pharmacies?lat=X&lng=Y
// Patient checks which pharmacies stock all (or some) meds in their prescription
router.get("/map/prescription/:id/pharmacies", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const prescriptionId = parseInt(idParam);
  if (isNaN(prescriptionId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Fetch prescription to verify ownership
  const [prescription] = await db
    .select()
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.id, prescriptionId));

  if (!prescription) { res.status(404).json({ error: "Prescription not found" }); return; }

  // Patient can only check their own prescription
  if (session.roles.includes("patient") && prescription.patientId !== session.patientDbId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Get prescription items
  const items = await db
    .select()
    .from(prescriptionItemsTable)
    .where(eq(prescriptionItemsTable.prescriptionId, prescriptionId));

  const medIds = items.map((i) => i.medicationId).filter(Boolean) as number[];
  if (medIds.length === 0) {
    res.json({ prescription, medIds: [], pharmacies: [] });
    return;
  }

  const { lat, lng } = parseLoc(req);
  const totalRequested = medIds.length;
  const idsArray = `{${medIds.join(",")}}`;

  const result = await db.execute(sql`
    SELECT
      ph.id, ph.name, ph.address, ph.phone, ph.is_open_24h,
      CAST(ph.latitude AS FLOAT) AS latitude,
      CAST(ph.longitude AS FLOAT) AS longitude,
      ROUND(CAST(
        6371 * acos(LEAST(1.0,
          cos(radians(${lat})) * cos(radians(CAST(ph.latitude AS FLOAT))) *
          cos(radians(CAST(ph.longitude AS FLOAT)) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(CAST(ph.latitude AS FLOAT)))
        ))
      AS NUMERIC), 2) AS distance_km,
      COALESCE(inv.available_count, 0)::int AS available_count,
      COALESCE(inv.available_ids, ARRAY[]::int[]) AS available_ids,
      ${totalRequested}::int AS total_requested
    FROM pharmacies ph
    LEFT JOIN (
      SELECT pharmacy_id,
        COUNT(*)::int AS available_count,
        array_agg(medication_id::int) AS available_ids
      FROM pharmacy_inventory
      WHERE medication_id = ANY(${idsArray}::int[])
        AND in_stock = true AND quantity > 0
      GROUP BY pharmacy_id
    ) inv ON inv.pharmacy_id = ph.id
    WHERE ph.latitude IS NOT NULL AND ph.longitude IS NOT NULL
    ORDER BY inv.available_count DESC NULLS LAST, distance_km ASC
  `);

  const pharmacies = result.rows.map((r: any) => ({
    ...r,
    hasAll: r.available_count >= totalRequested,
    hasSome: r.available_count > 0 && r.available_count < totalRequested,
    hasNone: r.available_count === 0,
    missingIds: medIds.filter((id) => !(r.available_ids as number[]).includes(id)),
  }));

  res.json({ prescription, medIds, items, pharmacies });
});

export default router;
