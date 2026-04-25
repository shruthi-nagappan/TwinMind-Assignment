/**
 * Day 7 — session export: download transcript, suggestion batches, chat, and
 * optional settings as one JSON file for debugging or archival.
 * Day 9 — `parseSessionImportJson` validates the same shape for UI import.
 */
import type {
  AppSettings,
  ChatMessage,
  MeetingPhase,
  MeetingType,
  Suggestion,
  SuggestionBatch,
  SuggestionType,
  TranscriptChunk,
} from "@/lib/types";

export const SESSION_EXPORT_SCHEMA_VERSION = 1 as const;

export interface SessionExport {
  schemaVersion: typeof SESSION_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  meetingStartTime: string | null;
  transcript: TranscriptChunk[];
  suggestionBatches: SuggestionBatch[];
  chatMessages: ChatMessage[];
  /** Included so a session can be reasoned about or re-imported later; never contains API keys. */
  settings?: AppSettings;
}

export function buildSessionExport(input: {
  transcript: TranscriptChunk[];
  suggestionBatches: SuggestionBatch[];
  chatMessages: ChatMessage[];
  meetingStartTime: string | null;
  settings?: AppSettings;
  exportedAt?: Date;
}): SessionExport {
  const exportedAt = (input.exportedAt ?? new Date()).toISOString();
  const base: SessionExport = {
    schemaVersion: SESSION_EXPORT_SCHEMA_VERSION,
    exportedAt,
    meetingStartTime: input.meetingStartTime,
    transcript: input.transcript,
    suggestionBatches: input.suggestionBatches,
    chatMessages: input.chatMessages,
  };
  if (input.settings) {
    return { ...base, settings: input.settings };
  }
  return base;
}

export function sessionExportToJson(exportData: SessionExport): string {
  return `${JSON.stringify(exportData, null, 2)}\n`;
}

export function downloadSessionJson(exportData: SessionExport): void {
  if (typeof window === "undefined") return;
  const safeStamp = exportData.exportedAt.replace(/[:.]/g, "-");
  const filename = `twinmind-session-${safeStamp}.json`;
  const body = sessionExportToJson(exportData);
  const blob = new Blob([body], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const MEETING_TYPES = new Set<MeetingType>([
  "interview",
  "sales_call",
  "brainstorm",
  "technical_sync",
  "lecture",
  "one_on_one",
  "generic",
]);

const SUGGESTION_TYPES = new Set<SuggestionType>([
  "answer",
  "fact_check",
  "question_to_ask",
  "talking_point",
]);

const MEETING_PHASES = new Set<MeetingPhase>([
  "opening",
  "deep_dive",
  "closing",
]);

function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function parseTranscriptChunk(
  raw: unknown,
  index: number,
): { ok: true; chunk: TranscriptChunk } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: `transcript[${index}] must be an object.` };
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) {
    return { ok: false, error: `transcript[${index}].id must be a non-empty string.` };
  }
  if (typeof o.text !== "string") {
    return { ok: false, error: `transcript[${index}].text must be a string.` };
  }
  if (!isNonEmptyString(o.timestamp)) {
    return {
      ok: false,
      error: `transcript[${index}].timestamp must be a non-empty string.`,
    };
  }
  const wordCount =
    typeof o.wordCount === "number" && Number.isFinite(o.wordCount) && o.wordCount >= 0
      ? Math.floor(o.wordCount)
      : countWords(String(o.text));
  return {
    ok: true,
    chunk: {
      id: o.id,
      text: o.text,
      timestamp: o.timestamp,
      wordCount,
    },
  };
}

function parseSuggestion(
  raw: unknown,
  path: string,
): { ok: true; suggestion: Suggestion } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: `${path} must be an object.` };
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) {
    return { ok: false, error: `${path}.id must be a non-empty string.` };
  }
  if (!isNonEmptyString(o.type) || !SUGGESTION_TYPES.has(o.type as SuggestionType)) {
    return { ok: false, error: `${path}.type is not a valid suggestion type.` };
  }
  if (!isNonEmptyString(o.preview)) {
    return { ok: false, error: `${path}.preview must be a non-empty string.` };
  }
  if (!isNonEmptyString(o.detail_hint)) {
    return { ok: false, error: `${path}.detail_hint must be a non-empty string.` };
  }
  if (
    !isNonEmptyString(o.meeting_phase) ||
    !MEETING_PHASES.has(o.meeting_phase as MeetingPhase)
  ) {
    return { ok: false, error: `${path}.meeting_phase is not a valid phase.` };
  }
  return {
    ok: true,
    suggestion: {
      id: o.id,
      type: o.type as SuggestionType,
      preview: o.preview,
      detail_hint: o.detail_hint,
      meeting_phase: o.meeting_phase as MeetingPhase,
    },
  };
}

function parseSuggestionBatch(
  raw: unknown,
  index: number,
): { ok: true; batch: SuggestionBatch } | { ok: false; error: string } {
  const path = `suggestionBatches[${index}]`;
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: `${path} must be an object.` };
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) {
    return { ok: false, error: `${path}.id must be a non-empty string.` };
  }
  if (!isNonEmptyString(o.timestamp)) {
    return { ok: false, error: `${path}.timestamp must be a non-empty string.` };
  }
  if (
    typeof o.transcriptWordCount !== "number" ||
    !Number.isFinite(o.transcriptWordCount) ||
    o.transcriptWordCount < 0
  ) {
    return {
      ok: false,
      error: `${path}.transcriptWordCount must be a non-negative number.`,
    };
  }
  if (!Array.isArray(o.suggestions)) {
    return { ok: false, error: `${path}.suggestions must be an array.` };
  }
  const suggestions: Suggestion[] = [];
  for (let i = 0; i < o.suggestions.length; i++) {
    const s = parseSuggestion(o.suggestions[i], `${path}.suggestions[${i}]`);
    if (!s.ok) return s;
    suggestions.push(s.suggestion);
  }
  let meetingType: MeetingType | undefined;
  if (o.meetingType !== undefined && o.meetingType !== null) {
    if (!isNonEmptyString(o.meetingType) || !MEETING_TYPES.has(o.meetingType as MeetingType)) {
      return { ok: false, error: `${path}.meetingType is not a valid meeting type.` };
    }
    meetingType = o.meetingType as MeetingType;
  }
  const batch: SuggestionBatch = {
    id: o.id,
    timestamp: o.timestamp,
    transcriptWordCount: Math.floor(o.transcriptWordCount),
    suggestions,
    ...(meetingType !== undefined ? { meetingType } : {}),
  };
  return { ok: true, batch };
}

function parseChatMessage(
  raw: unknown,
  index: number,
): { ok: true; message: ChatMessage } | { ok: false; error: string } {
  const path = `chatMessages[${index}]`;
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: `${path} must be an object.` };
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) {
    return { ok: false, error: `${path}.id must be a non-empty string.` };
  }
  if (o.role !== "user" && o.role !== "assistant") {
    return { ok: false, error: `${path}.role must be "user" or "assistant".` };
  }
  if (typeof o.content !== "string") {
    return { ok: false, error: `${path}.content must be a string.` };
  }
  if (!isNonEmptyString(o.timestamp)) {
    return { ok: false, error: `${path}.timestamp must be a non-empty string.` };
  }
  const msg: ChatMessage = {
    id: o.id,
    role: o.role,
    content: o.content,
    timestamp: o.timestamp,
  };
  if (o.linkedSuggestion !== undefined && o.linkedSuggestion !== null) {
    const ls = o.linkedSuggestion;
    if (!ls || typeof ls !== "object") {
      return { ok: false, error: `${path}.linkedSuggestion must be an object.` };
    }
    const l = ls as Record<string, unknown>;
    if (
      !isNonEmptyString(l.type) ||
      !SUGGESTION_TYPES.has(l.type as SuggestionType) ||
      !isNonEmptyString(l.preview)
    ) {
      return {
        ok: false,
        error: `${path}.linkedSuggestion needs type and preview strings.`,
      };
    }
    msg.linkedSuggestion = {
      type: l.type as SuggestionType,
      preview: l.preview,
    };
  }
  return { ok: true, message: msg };
}

function parseAppSettings(raw: unknown): { ok: true; settings: AppSettings } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "settings must be an object when present." };
  }
  const o = raw as Record<string, unknown>;
  const keys: (keyof AppSettings)[] = [
    "suggestionPrompt",
    "detailedAnswerPrompt",
    "chatSystemPrompt",
    "rollingSummaryPrompt",
    "suggestionContextWindow",
    "expandedContextWindow",
    "suggestionTemperature",
    "chatTemperature",
    "skipRegenerationThreshold",
    "refreshIntervalSeconds",
  ];
  for (const k of keys) {
    if (!(k in o)) {
      return { ok: false, error: `settings.${String(k)} is required.` };
    }
  }
  const num = (v: unknown, label: string) => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return { ok: false as const, error: `${label} must be a finite number.` };
    }
    return { ok: true as const, n: v };
  };
  for (const k of [
    "suggestionPrompt",
    "detailedAnswerPrompt",
    "chatSystemPrompt",
    "rollingSummaryPrompt",
  ] as const) {
    if (typeof o[k] !== "string") {
      return { ok: false, error: `settings.${k} must be a string.` };
    }
  }
  const cw = num(o.suggestionContextWindow, "settings.suggestionContextWindow");
  if (!cw.ok) return cw;
  const ew = num(o.expandedContextWindow, "settings.expandedContextWindow");
  if (!ew.ok) return ew;
  const st = num(o.suggestionTemperature, "settings.suggestionTemperature");
  if (!st.ok) return st;
  const ct = num(o.chatTemperature, "settings.chatTemperature");
  if (!ct.ok) return ct;
  const sk = num(o.skipRegenerationThreshold, "settings.skipRegenerationThreshold");
  if (!sk.ok) return sk;
  const ri = num(o.refreshIntervalSeconds, "settings.refreshIntervalSeconds");
  if (!ri.ok) return ri;

  return {
    ok: true,
    settings: {
      suggestionPrompt: o.suggestionPrompt as string,
      detailedAnswerPrompt: o.detailedAnswerPrompt as string,
      chatSystemPrompt: o.chatSystemPrompt as string,
      rollingSummaryPrompt: o.rollingSummaryPrompt as string,
      suggestionContextWindow: Math.floor(cw.n),
      expandedContextWindow: Math.floor(ew.n),
      suggestionTemperature: st.n,
      chatTemperature: ct.n,
      skipRegenerationThreshold: Math.floor(sk.n),
      refreshIntervalSeconds: Math.floor(ri.n),
    },
  };
}

/**
 * Day 9 — parse and validate a TwinMind session JSON file (from Day 7 export
 * or compatible tooling) for import into the live UI.
 */
export function parseSessionImportJson(
  raw: string,
): { ok: true; session: SessionExport } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Session file must be a JSON object." };
  }
  const o = parsed as Record<string, unknown>;
  if (o.schemaVersion !== SESSION_EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported schemaVersion (expected ${SESSION_EXPORT_SCHEMA_VERSION}).`,
    };
  }
  if (!isNonEmptyString(o.exportedAt)) {
    return { ok: false, error: "exportedAt must be a non-empty string." };
  }
  if (o.meetingStartTime !== null && o.meetingStartTime !== undefined) {
    if (typeof o.meetingStartTime !== "string") {
      return { ok: false, error: "meetingStartTime must be a string or null." };
    }
  }

  if (!Array.isArray(o.transcript)) {
    return { ok: false, error: "transcript must be an array." };
  }
  const transcript: TranscriptChunk[] = [];
  for (let i = 0; i < o.transcript.length; i++) {
    const c = parseTranscriptChunk(o.transcript[i], i);
    if (!c.ok) return c;
    transcript.push(c.chunk);
  }

  if (!Array.isArray(o.suggestionBatches)) {
    return { ok: false, error: "suggestionBatches must be an array." };
  }
  const suggestionBatches: SuggestionBatch[] = [];
  for (let i = 0; i < o.suggestionBatches.length; i++) {
    const b = parseSuggestionBatch(o.suggestionBatches[i], i);
    if (!b.ok) return b;
    suggestionBatches.push(b.batch);
  }

  if (!Array.isArray(o.chatMessages)) {
    return { ok: false, error: "chatMessages must be an array." };
  }
  const chatMessages: ChatMessage[] = [];
  for (let i = 0; i < o.chatMessages.length; i++) {
    const m = parseChatMessage(o.chatMessages[i], i);
    if (!m.ok) return m;
    chatMessages.push(m.message);
  }

  let settings: AppSettings | undefined;
  if (o.settings !== undefined) {
    const s = parseAppSettings(o.settings);
    if (!s.ok) return s;
    settings = s.settings;
  }

  const session: SessionExport = {
    schemaVersion: SESSION_EXPORT_SCHEMA_VERSION,
    exportedAt: o.exportedAt,
    meetingStartTime:
      o.meetingStartTime === null || o.meetingStartTime === undefined
        ? null
        : (o.meetingStartTime as string),
    transcript,
    suggestionBatches,
    chatMessages,
    ...(settings !== undefined ? { settings } : {}),
  };
  return { ok: true, session };
}
