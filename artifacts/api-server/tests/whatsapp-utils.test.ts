import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWhatsappPhone } from "../src/lib/whatsapp-phone.ts";
import {
  addLocalDays,
  intervalsOverlap,
  localTimeToUtc,
  matchesScheduleSlot,
  minutesOfDay,
  partsInTimeZone,
  validTimeZone,
} from "../src/lib/whatsapp-time.ts";

test("normalizes Gulf and international WhatsApp phone formats", () => {
  assert.equal(normalizeWhatsappPhone("+974 5012-3456"), "+97450123456");
  assert.equal(normalizeWhatsappPhone("00971501234567"), "+971501234567");
});

test("rejects phone numbers without a plausible international length", () => {
  assert.equal(normalizeWhatsappPhone("12345"), null);
  assert.equal(normalizeWhatsappPhone("+0123456789"), null);
  assert.equal(normalizeWhatsappPhone("97450123456"), null);
  assert.equal(normalizeWhatsappPhone("+1234567890123456"), null);
});

test("converts clinic-local time using the configured Gulf timezone", () => {
  assert.equal(validTimeZone("Asia/Qatar"), true);
  assert.equal(localTimeToUtc("2026-12-01", "09:00", "Asia/Qatar")?.toISOString(), "2026-12-01T06:00:00.000Z");
  assert.deepEqual(partsInTimeZone(new Date("2026-12-01T06:00:00Z"), "Asia/Qatar"), {
    year: 2026, month: 12, day: 1, hour: 9, minute: 0, second: 0, weekday: 2,
  });
});

test("rejects nonexistent local times during daylight-saving transitions", () => {
  assert.equal(localTimeToUtc("2027-03-14", "02:30", "America/New_York"), null);
});

test("handles local date arithmetic and slot-time parsing", () => {
  assert.equal(addLocalDays("2026-12-31", 1), "2027-01-01");
  assert.equal(minutesOfDay("08:30:00"), 510);
});

test("matches schedule slots by weekday, effective dates, and duration", () => {
  const rule = {
    dayOfWeek: 2,
    startTime: "09:00:00",
    endTime: "10:00:00",
    slotDurationMinutes: 30,
    effectiveFrom: "2026-12-01",
    effectiveUntil: "2027-01-01",
  };
  const local = partsInTimeZone(new Date("2026-12-01T06:00:00Z"), "Asia/Qatar");
  assert.equal(matchesScheduleSlot(rule, local, "2026-12-01"), true);
  assert.equal(matchesScheduleSlot(rule, { ...local, minute: 15 }, "2026-12-01"), false);
  assert.equal(matchesScheduleSlot(rule, local, "2026-11-30"), false);
  assert.equal(matchesScheduleSlot({ ...rule, dayOfWeek: 3 }, local, "2026-12-01"), false);
});

test("detects overlapping appointments but allows adjacent slots", () => {
  assert.equal(intervalsOverlap(new Date("2026-12-01T06:00Z"), new Date("2026-12-01T06:30Z"), new Date("2026-12-01T06:30Z"), new Date("2026-12-01T07:00Z")), false);
  assert.equal(intervalsOverlap(new Date("2026-12-01T06:00Z"), new Date("2026-12-01T06:30Z"), new Date("2026-12-01T06:29Z"), new Date("2026-12-01T07:00Z")), true);
});
