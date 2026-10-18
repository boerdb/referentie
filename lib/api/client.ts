/** Resultaat van een API-aanroep vanuit de browser; gooit nooit. */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

type ApiOptions = Omit<RequestInit, "body"> & {
  /** Wordt als JSON verstuurd; FormData gaat ongewijzigd mee. */
  body?: unknown;
};

/**
 * Kleine fetch-wrapper: JSON in en uit, en een Nederlandse foutmelding bij
 * een netwerkfout, verlopen sessie of een antwoord dat geen JSON is.
 */
export async function api<T = unknown>(
  url: string,
  { body, headers, ...init }: ApiOptions = {},
): Promise<ApiResult<T>> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      ...init,
      headers:
        body !== undefined && !isForm
          ? { "Content-Type": "application/json", ...headers }
          : headers,
      body:
        body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: "Geen verbinding met de server." };
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* geen JSON-body */
  }

  if (res.ok) return { ok: true, status: res.status, data: data as T };
  if (res.status === 401) {
    return { ok: false, status: 401, error: "Je sessie is verlopen. Log opnieuw in." };
  }
  const message =
    data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : `Er ging iets mis (HTTP ${res.status}).`;
  return { ok: false, status: res.status, error: message };
}
