import { describe, expect, it } from "vitest";
import {
  SESSION_EXPORT_SCHEMA_VERSION,
  buildSessionExport,
  sessionExportToJson,
} from "./exportSession";
import type { AppSettings, ChatMessage, SuggestionBatch, TranscriptChunk } from "./types";

const sampleChunk: TranscriptChunk = {
  id: "t-1",
  text: "Hello world",
  timestamp: "10:00:00 AM",
  wordCount: 2,
};

const sampleBatch: SuggestionBatch = {
  id: "b-1",
  timestamp: "10:01:00 AM",
  transcriptWordCount: 2,
  meetingType: "generic",
  suggestions: [
    {
      id: "s-1",
      type: "answer",
      preview: "Try this",
      detail_hint: "expand",
      meeting_phase: "deep_dive",
    },
  ],
};

const sampleMessage: ChatMessage = {
  id: "m-1",
  role: "user",
  content: "What did they say?",
  timestamp: "10:02:00 AM",
};

const sampleSettings: AppSettings = {
  suggestionPrompt: "p1",
  detailedAnswerPrompt: "p2",
  chatSystemPrompt: "p3",
  rollingSummaryPrompt: "p4",
  suggestionContextWindow: 4000,
  expandedContextWindow: 8000,
  suggestionTemperature: 0.4,
  chatTemperature: 0.5,
  skipRegenerationThreshold: 50,
  refreshIntervalSeconds: 30,
};

describe("buildSessionExport", () => {
  it("builds a v1 payload with ISO exportedAt", () => {
    const fixed = new Date("2026-04-23T12:00:00.000Z");
    const exp = buildSessionExport({
      transcript: [sampleChunk],
      suggestionBatches: [sampleBatch],
      chatMessages: [sampleMessage],
      meetingStartTime: "2026-04-23T11:00:00.000Z",
      exportedAt: fixed,
    });
    expect(exp.schemaVersion).toBe(SESSION_EXPORT_SCHEMA_VERSION);
    expect(exp.exportedAt).toBe("2026-04-23T12:00:00.000Z");
    expect(exp.meetingStartTime).toBe("2026-04-23T11:00:00.000Z");
    expect(exp.transcript).toEqual([sampleChunk]);
    expect(exp.suggestionBatches).toEqual([sampleBatch]);
    expect(exp.chatMessages).toEqual([sampleMessage]);
    expect(exp.settings).toBeUndefined();
  });

  it("embeds settings when provided", () => {
    const exp = buildSessionExport({
      transcript: [],
      suggestionBatches: [],
      chatMessages: [],
      meetingStartTime: null,
      settings: sampleSettings,
    });
    expect(exp.settings).toEqual(sampleSettings);
  });
});

describe("sessionExportToJson", () => {
  it("produces pretty-printed JSON ending with newline", () => {
    const exp = buildSessionExport({
      transcript: [sampleChunk],
      suggestionBatches: [],
      chatMessages: [],
      meetingStartTime: null,
      exportedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const json = sessionExportToJson(exp);
    expect(json.endsWith("\n")).toBe(true);
    expect(json).toContain('"schemaVersion": 1');
    expect(json).toContain("Hello world");
    const roundTrip = JSON.parse(json.trim()) as SessionExport;
    expect(roundTrip.transcript[0]?.id).toBe("t-1");
  });
});
