export function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

export function partsInTimeZone(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(value.year),
    month: Number(value.month),
    day: Number(value.day),
    hour: Number(value.hour),
    minute: Number(value.minute),
    second: Number(value.second),
    weekday: weekdays.indexOf(weekday),
  };
}

export function localDateText(parts: Pick<ZonedParts, "year" | "month" | "day">): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Convert a clinic-local wall time to an instant, returning null for DST gaps. */
export function localTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = target;
  for (let i = 0; i < 4; i += 1) {
    const parts = partsInTimeZone(new Date(candidate), timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
    const delta = target - represented;
    if (delta === 0) break;
    candidate += delta;
  }
  const result = new Date(candidate);
  const check = partsInTimeZone(result, timeZone);
  if (check.year !== year || check.month !== month || check.day !== day || check.hour !== hour || check.minute !== minute) return null;
  return result;
}

export function addLocalDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export function minutesOfDay(time: string): number {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function matchesScheduleSlot(
  rule: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    slotDurationMinutes: number;
    effectiveFrom?: string | null;
    effectiveUntil?: string | null;
  },
  local: ZonedParts,
  date: string,
): boolean {
  const minute = local.hour * 60 + local.minute;
  const start = minutesOfDay(rule.startTime);
  return rule.dayOfWeek === local.weekday
    && (!rule.effectiveFrom || rule.effectiveFrom <= date)
    && (!rule.effectiveUntil || rule.effectiveUntil >= date)
    && minute >= start
    && minute + rule.slotDurationMinutes <= minutesOfDay(rule.endTime)
    && (minute - start) % rule.slotDurationMinutes === 0
    && local.second === 0;
}


export function weekdayOfDate(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function findNearestWithAvailability<T>(dates: readonly string[], slotsForDate: (date: string) => T[]) {
  let searchedThrough: string | null = null;
  for (const date of dates) {
    searchedThrough = date;
    const available = slotsForDate(date);
    if (available.length) return { date, searchedThrough, available };
  }
  return { date: null, searchedThrough, available: [] as T[] };
}

export function intervalsOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}
