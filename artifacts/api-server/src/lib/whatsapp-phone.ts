/** E.164-normalize display punctuation; callers must supply the country code. */
export function normalizeWhatsappPhone(input: string): string | null {
  let value = input.trim().replace(/[\s().-]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  else if (!value.startsWith("+")) return null;
  if (!/^\+[1-9]\d{6,14}$/.test(value)) return null;
  return value;
}
