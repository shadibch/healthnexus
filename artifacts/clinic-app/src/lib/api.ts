const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface ApiError extends Error {
  status?: number;
  body?: Record<string, unknown>;
}

/** Map raw backend error codes to a friendly, translatable message. */
export function friendlyError(
  err: unknown,
  t: (k: string) => string,
): string {
  const code = (err as ApiError)?.message ?? "";
  switch (code) {
    case "INVALID_OR_EXPIRED_VERIFICATION":
    case "INVALID_RESET_TOKEN":
      return t("invalidOrExpiredToken");
    case "RESET_TOKEN_EXPIRED":
      return t("resetTokenExpired");
    case "ACCOUNT_NOT_VERIFIED":
      return t("accountNotActivated");
    case "INVALID_EMAIL_OR_PASSWORD":
      return t("invalidCredentials");
    default:
      return (err as ApiError)?.status !== 400 && (err as ApiError)?.message === code && code
        ? code
        : (err instanceof Error ? err.message : "Request failed");
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(body.error ?? "Request failed") as ApiError;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
