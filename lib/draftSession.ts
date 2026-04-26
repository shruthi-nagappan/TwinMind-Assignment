/**
 * Day 10 — browser-local draft of the in-flight session (survives refresh /
 * tab close). Distinct from Day 7 manual JSON export and Day 9 file import.
 */
export const DRAFT_SESSION_STORAGE_KEY = "twinmind.draft_session_v1";

/** Stay under typical 5MB localStorage limits with headroom. */
export const DRAFT_SESSION_MAX_CHARS = 4_000_000;

export function readDraftSessionJson(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(DRAFT_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeDraftSessionJson(json: string): void {
  if (typeof localStorage === "undefined") return;
  if (json.length > DRAFT_SESSION_MAX_CHARS) return;
  try {
    localStorage.setItem(DRAFT_SESSION_STORAGE_KEY, json);
  } catch {
    // QuotaExceeded or private mode
  }
}

export function clearDraftSession(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}
