/**
 * Day 7 — session export: download transcript, suggestion batches, chat, and
 * optional settings as one JSON file for debugging or archival.
 */
import type {
  AppSettings,
  ChatMessage,
  SuggestionBatch,
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
