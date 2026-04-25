"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AppHeader from "@/components/AppHeader";
import MicTranscript from "@/components/MicTranscript";
import SettingsModal from "@/components/SettingsModal";
import SuggestionCard from "@/components/SuggestionCard";
import {
  buildSessionExport,
  downloadSessionJson,
  parseSessionImportJson,
} from "@/lib/exportSession";
import {
  getFixtureById,
  MEETING_SESSION_FIXTURES,
} from "@/lib/meetingSessionFixtures";
import { DEFAULT_SETTINGS, SUGGESTION_TYPE_META } from "@/lib/prompts";
import { useMicRecorder } from "@/lib/useMicRecorder";
import { useSuggestions } from "@/lib/useSuggestions";
import { useChat } from "@/lib/useChat";
import type {
  AppSettings,
  ChatMessage,
  MeetingType,
  Suggestion,
  SuggestionBatch,
  TranscriptChunk,
} from "@/lib/types";

const API_KEY_STORAGE = "twinmind.groq_api_key";
const SETTINGS_STORAGE = "twinmind.settings";

const FIXTURE_SELECT_OPTIONS = MEETING_SESSION_FIXTURES.map((f) => ({
  id: f.id,
  label: f.label,
}));

function formatClockTime(d: Date = new Date()): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function countWords(s: string): number {
  const trimmed = s.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [transcript, setTranscript] = useState<TranscriptChunk[]>([]);
  const [transcribingCount, setTranscribingCount] = useState(0);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [meetingStartTime, setMeetingStartTime] = useState<string | null>(null);

  /** Bumped on “new meeting” / fixture / import so late transcribe chunks cannot append. */
  const transcriptEpochRef = useRef(0);

  const apiKeyRef = useRef(apiKey);
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  useEffect(() => {
    try {
      const storedKey = sessionStorage.getItem(API_KEY_STORAGE);
      if (storedKey) setApiKey(storedKey);
      const storedSettings = sessionStorage.getItem(SETTINGS_STORAGE);
      if (storedSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
      }
    } catch {
      // ignore
    }
  }, []);

  function handleApiKeyChange(key: string) {
    setApiKey(key);
    try {
      if (key) sessionStorage.setItem(API_KEY_STORAGE, key);
      else sessionStorage.removeItem(API_KEY_STORAGE);
    } catch {
      // ignore
    }
  }

  function handleSettingsChange(next: AppSettings) {
    setSettings(next);
    try {
      sessionStorage.setItem(SETTINGS_STORAGE, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  const handleChunk = useCallback(async (blob: Blob) => {
    const key = apiKeyRef.current;
    if (!key) {
      setTranscriptError(
        "No Groq API key set. Open Settings to paste your key, then try again.",
      );
      return;
    }

    setTranscribingCount((c) => c + 1);
    const timestamp = formatClockTime();

    try {
      const form = new FormData();
      form.append("audio", blob, "chunk.webm");

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
        headers: { "x-groq-api-key": key },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Transcribe failed (${res.status})`);
      }

      const data = (await res.json()) as { text: string; duration: number | null };
      const text = (data.text || "").trim();
      if (!text) return;

      const epochAtSuccess = transcriptEpochRef.current;
      const newChunk: TranscriptChunk = {
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        timestamp,
        wordCount: countWords(text),
      };
      setTranscript((prev) => {
        if (transcriptEpochRef.current !== epochAtSuccess) return prev;
        return [...prev, newChunk];
      });
      setMeetingStartTime((prev) => {
        if (transcriptEpochRef.current !== epochAtSuccess) return prev;
        return prev ?? new Date().toISOString();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transcription failed";
      setTranscriptError(msg);
    } finally {
      setTranscribingCount((c) => Math.max(0, c - 1));
    }
  }, []);

  const handleRecorderError = useCallback((err: Error) => {
    setTranscriptError(err.message);
  }, []);

  const recorder = useMicRecorder({
    chunkMs: (settings.refreshIntervalSeconds || 30) * 1000,
    onChunk: handleChunk,
    onError: handleRecorderError,
  });

  useEffect(() => {
    if (recorder.error) setTranscriptError(recorder.error);
  }, [recorder.error]);

  const suggestions = useSuggestions({
    transcript,
    meetingStartTime,
    apiKey,
    settings,
    // Keep auto-refresh alive while transcript exists (even after stop) so
    // the user can manually reload on stored transcript; pause only when
    // there's literally nothing yet.
    enabled: transcript.length > 0 && Boolean(apiKey),
  });

  const detectedMeetingType = suggestions.batches[0]?.meetingType ?? null;

  const chat = useChat({
    transcript,
    detectedMeetingType,
    apiKey,
    settings,
  });

  const handleExpandSuggestion = useCallback(
    (s: Suggestion) => {
      void chat.expandSuggestion(s);
    },
    [chat],
  );

  const handleExportSession = useCallback(() => {
    const payload = buildSessionExport({
      transcript,
      suggestionBatches: suggestions.batches,
      chatMessages: chat.messages,
      meetingStartTime,
      settings,
    });
    downloadSessionJson(payload);
  }, [
    transcript,
    suggestions.batches,
    chat.messages,
    meetingStartTime,
    settings,
  ]);

  /** Day 8 — load canned transcript for `/api/suggestions` QA without the mic. */
  const handleLoadFixture = useCallback(
    (fixtureId: string) => {
      const fixture = getFixtureById(fixtureId);
      if (!fixture) return;
      transcriptEpochRef.current += 1;
      if (recorder.isRecording) recorder.stop();
      suggestions.clearAll();
      chat.clear();
      setTranscriptError(null);
      setTranscript(fixture.chunks.map((c) => ({ ...c })));
      setMeetingStartTime((prev) =>
        prev ?? new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      );
    },
    [recorder, suggestions, chat],
  );

  /** Day 9 — restore transcript, suggestions, chat, and optional settings from export JSON. */
  const handleImportSessionJson = useCallback(
    (raw: string) => {
      const result = parseSessionImportJson(raw);
      if (!result.ok) {
        setTranscriptError(result.error);
        return;
      }
      transcriptEpochRef.current += 1;
      if (recorder.isRecording) recorder.stop();
      setTranscriptError(null);
      const { session } = result;
      setTranscript(session.transcript.map((c) => ({ ...c })));
      setMeetingStartTime(session.meetingStartTime);
      suggestions.hydrateBatches(session.suggestionBatches);
      chat.hydrateMessages(session.chatMessages);
      if (session.settings) {
        const next = { ...DEFAULT_SETTINGS, ...session.settings };
        setSettings(next);
        try {
          sessionStorage.setItem(SETTINGS_STORAGE, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
    },
    [recorder, suggestions, chat],
  );

  const canExportSession =
    transcript.length > 0 ||
    suggestions.batches.length > 0 ||
    chat.messages.length > 0;

  const canStartFreshMeeting =
    recorder.isRecording ||
    transcribingCount > 0 ||
    transcript.length > 0 ||
    suggestions.batches.length > 0 ||
    chat.messages.length > 0 ||
    meetingStartTime != null;

  const handleNewMeeting = useCallback(() => {
    transcriptEpochRef.current += 1;
    if (recorder.isRecording) recorder.stop();
    suggestions.clearAll();
    chat.clear();
    setTranscript([]);
    setMeetingStartTime(null);
    setTranscriptError(null);
  }, [recorder, suggestions, chat]);

  const canRecord = Boolean(apiKey);

  async function handleToggleRecord() {
    if (!canRecord) {
      setSettingsOpen(true);
      return;
    }
    if (recorder.isRecording) {
      recorder.stop();
    } else {
      setTranscriptError(null);
      await recorder.start();
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-base)]">
      <AppHeader
        onOpenSettings={() => setSettingsOpen(true)}
        apiKeySet={Boolean(apiKey)}
      />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 bg-[var(--bg-base)] p-3 md:grid-cols-3">
        <TranscriptColumn
          transcript={transcript}
          isRecording={recorder.isRecording}
          isTranscribing={transcribingCount > 0}
          error={transcriptError}
          onToggleRecord={handleToggleRecord}
          onDismissError={() => setTranscriptError(null)}
          disabled={!canRecord && !recorder.isRecording}
          disabledReason={
            !canRecord
              ? "Paste your Groq API key in Settings to enable recording."
              : undefined
          }
          onExportSession={handleExportSession}
          exportEnabled={canExportSession}
          exportDisabledReason={
            canExportSession
              ? undefined
              : "Record, generate suggestions, or chat first."
          }
          fixtureOptions={FIXTURE_SELECT_OPTIONS}
          onLoadFixture={handleLoadFixture}
          onImportSessionJson={handleImportSessionJson}
          onNewMeeting={handleNewMeeting}
          newMeetingEnabled={canStartFreshMeeting}
        />
        <SuggestionsColumn
          batches={suggestions.batches}
          isLoading={suggestions.isLoading}
          error={suggestions.error}
          nextRefreshInSeconds={suggestions.nextRefreshInSeconds}
          transcriptHasContent={transcript.length > 0}
          apiKeySet={Boolean(apiKey)}
          onReload={() => suggestions.refresh({ force: true })}
          onDismissError={suggestions.clearError}
          onSuggestionClick={handleExpandSuggestion}
        />
        <ChatColumn
          messages={chat.messages}
          streamingAssistantId={chat.streamingAssistantId}
          isStreaming={chat.isStreaming}
          error={chat.error}
          apiKeySet={Boolean(apiKey)}
          onSend={chat.send}
          onAbort={chat.abort}
          onClear={chat.clear}
          onDismissError={chat.clearError}
        />
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        apiKey={apiKey}
        onApiKeyChange={handleApiKeyChange}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
}

function ColumnHeader({
  index,
  title,
  badge,
  badgeTone = "muted",
}: {
  index: number;
  title: string;
  badge: string;
  badgeTone?: "muted" | "teal" | "red";
}) {
  const toneClass =
    badgeTone === "red"
      ? "text-red-300 bg-red-500/15"
      : badgeTone === "teal"
        ? "text-[var(--accent-teal)] bg-teal-500/10"
        : "text-[var(--text-muted)] bg-white/5";
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-3.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
        <span className="text-[var(--text-muted)]">{index}.</span> {title}
      </span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${toneClass}`}
      >
        {badgeTone === "red" && (
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse-soft" />
        )}
        {badge}
      </span>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-6 mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-4 py-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
      {children}
    </div>
  );
}

function TranscriptColumn({
  transcript,
  isRecording,
  isTranscribing,
  error,
  onToggleRecord,
  onDismissError,
  disabled,
  disabledReason,
  onExportSession,
  exportEnabled,
  exportDisabledReason,
  fixtureOptions,
  onLoadFixture,
  onImportSessionJson,
  onNewMeeting,
  newMeetingEnabled = false,
}: {
  transcript: TranscriptChunk[];
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  onToggleRecord: () => void;
  onDismissError: () => void;
  disabled?: boolean;
  disabledReason?: string;
  onExportSession?: () => void;
  exportEnabled?: boolean;
  exportDisabledReason?: string;
  fixtureOptions?: { id: string; label: string }[];
  onLoadFixture?: (fixtureId: string) => void;
  onImportSessionJson?: (jsonText: string) => void;
  onNewMeeting?: () => void;
  newMeetingEnabled?: boolean;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-xl shadow-black/40">
      <ColumnHeader
        index={1}
        title="Mic & Transcript"
        badge={isRecording ? "Recording" : "Idle"}
        badgeTone={isRecording ? "red" : "muted"}
      />
      <MicTranscript
        transcript={transcript}
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        error={error}
        onToggle={onToggleRecord}
        onDismissError={onDismissError}
        disabled={disabled}
        disabledReason={disabledReason}
        onExportSession={onExportSession}
        exportEnabled={exportEnabled}
        exportDisabledReason={exportDisabledReason}
        fixtureOptions={fixtureOptions}
        onLoadFixture={onLoadFixture}
        onImportSessionJson={onImportSessionJson}
        onNewMeeting={onNewMeeting}
        newMeetingEnabled={newMeetingEnabled}
      />
    </section>
  );
}

function SuggestionsColumn({
  batches,
  isLoading,
  error,
  nextRefreshInSeconds,
  transcriptHasContent,
  apiKeySet,
  onReload,
  onDismissError,
  onSuggestionClick,
}: {
  batches: SuggestionBatch[];
  isLoading: boolean;
  error: string | null;
  nextRefreshInSeconds: number | null;
  transcriptHasContent: boolean;
  apiKeySet: boolean;
  onReload: () => void;
  onDismissError: () => void;
  onSuggestionClick?: (s: Suggestion) => void;
}) {
  const totalBatches = batches.length;
  const latestMeetingType = batches[0]?.meetingType;
  const canReload = !isLoading && transcriptHasContent && apiKeySet;

  const refreshHint =
    !apiKeySet
      ? "API key required"
      : !transcriptHasContent
        ? "Start recording"
        : isLoading
          ? "Generating…"
          : nextRefreshInSeconds != null
            ? `Next auto-refresh in ${nextRefreshInSeconds}s`
            : "Auto-refresh paused";

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-xl shadow-black/40">
      <ColumnHeader
        index={2}
        title="Live Suggestions"
        badge={
          latestMeetingType
            ? formatMeetingTypeLabel(latestMeetingType)
            : `${totalBatches} ${totalBatches === 1 ? "Batch" : "Batches"}`
        }
        badgeTone={latestMeetingType ? "teal" : "muted"}
      />
      <div className="flex items-center justify-between px-6 pt-4">
        <button
          onClick={onReload}
          disabled={!canReload}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent-teal-dim)] bg-transparent px-3 py-1.5 text-[13px] font-medium text-[var(--accent-teal)] transition hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.2"
            className={isLoading ? "animate-spin" : ""}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0 1 14.32-4.9M20 14a8 8 0 0 1-14.32 4.9"
            />
          </svg>
          {isLoading ? "Reloading…" : "Reload suggestions"}
        </button>
        <span className="text-[12px] text-[var(--text-muted)]">
          {refreshHint}
        </span>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-start justify-between gap-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-[13px] leading-relaxed text-rose-200">
          <span className="break-words">{error}</span>
          <button
            onClick={onDismissError}
            className="rounded text-rose-300 hover:text-rose-100"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {totalBatches === 0 && !isLoading && (
          <SuggestionsEmptyState
            apiKeySet={apiKeySet}
            transcriptHasContent={transcriptHasContent}
          />
        )}
        {totalBatches === 0 && isLoading && <SuggestionsSkeleton />}
        {batches.map((batch, batchIdx) => (
          <div key={batch.id} className="space-y-3">
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-[var(--border-subtle)]" />
              <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {batchIdx === 0 ? "Latest" : `Batch ${totalBatches - batchIdx}`}
                {" · "}
                {batch.timestamp}
                {batch.meetingType && (
                  <>
                    {" · "}
                    <span className="text-[var(--accent-teal)]">
                      {formatMeetingTypeLabel(batch.meetingType)}
                    </span>
                  </>
                )}
              </span>
              <div className="h-px flex-1 bg-[var(--border-subtle)]" />
            </div>
            {batch.suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                faded={batchIdx > 0}
                onClick={onSuggestionClick}
              />
            ))}
          </div>
        ))}
        {totalBatches > 0 && isLoading && (
          <div className="flex items-center justify-center gap-2 py-2 text-[12px] text-[var(--text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-teal)] animate-pulse-soft" />
            Generating next batch…
          </div>
        )}
      </div>
    </section>
  );
}

function formatMeetingTypeLabel(t: MeetingType): string {
  return t.replace(/_/g, " ").toUpperCase();
}

function SuggestionsEmptyState({
  apiKeySet,
  transcriptHasContent,
}: {
  apiKeySet: boolean;
  transcriptHasContent: boolean;
}) {
  let title = "Waiting for the first batch";
  let body =
    "Record for a few seconds — the first suggestions land as soon as there's enough speech to reason about.";
  if (!apiKeySet) {
    title = "Add your Groq API key";
    body =
      "Open Settings and paste your Groq API key. Suggestions use Llama-class models hosted on Groq.";
  } else if (!transcriptHasContent) {
    title = "No transcript yet";
    body =
      "Start recording in the left column. After a few seconds the first 3 suggestions will appear here, then refresh every 30s.";
  }
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="max-w-[280px] space-y-2">
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">
          {title}
        </p>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          {body}
        </p>
      </div>
    </div>
  );
}

function SuggestionsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-md border border-[var(--border-subtle)] border-l-4 border-l-[var(--bg-panel-soft)] bg-[var(--bg-card)] px-4 py-3"
        >
          <div className="mb-2 h-3 w-20 animate-pulse-soft rounded bg-[var(--bg-panel-soft)]" />
          <div className="space-y-1.5">
            <div className="h-3 w-full animate-pulse-soft rounded bg-[var(--bg-panel-soft)]" />
            <div className="h-3 w-[85%] animate-pulse-soft rounded bg-[var(--bg-panel-soft)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatColumn({
  messages,
  streamingAssistantId,
  isStreaming,
  error,
  apiKeySet,
  onSend,
  onAbort,
  onClear,
  onDismissError,
}: {
  messages: ChatMessage[];
  streamingAssistantId: string | null;
  isStreaming: boolean;
  error: string | null;
  apiKeySet: boolean;
  onSend: (content: string) => Promise<void> | void;
  onAbort: () => void;
  onClear: () => void;
  onDismissError: () => void;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Keep the chat scrolled to the bottom as new tokens stream in.
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingAssistantId]);

  const canSend = draft.trim().length > 0 && !isStreaming && apiKeySet;

  const submit = async () => {
    if (!canSend) return;
    const content = draft;
    setDraft("");
    await onSend(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const placeholder = !apiKeySet
    ? "Add your API key in Settings to chat"
    : isStreaming
      ? "Streaming response…"
      : "Ask anything about this meeting — or click a suggestion to expand";

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-xl shadow-black/40">
      <ColumnHeader
        index={3}
        title="Chat (Detailed Answers)"
        badge={
          isStreaming
            ? "Streaming"
            : messages.length > 0
              ? `${messages.filter((m) => m.role === "user").length} Msg${messages.filter((m) => m.role === "user").length === 1 ? "" : "s"}`
              : "Session-only"
        }
        badgeTone={isStreaming ? "teal" : "muted"}
      />

      {messages.length > 0 && (
        <div className="flex items-center justify-end px-6 pt-3">
          <button
            onClick={onClear}
            disabled={isStreaming}
            className="text-[12px] text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            Clear chat
          </button>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-3 flex items-start justify-between gap-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-[13px] leading-relaxed text-rose-200">
          <span className="break-words">{error}</span>
          <button
            onClick={onDismissError}
            className="rounded text-rose-300 hover:text-rose-100"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-5 overflow-y-auto px-6 py-5"
      >
        {messages.length === 0 ? (
          <ChatEmptyState apiKeySet={apiKeySet} />
        ) : (
          messages.map((msg) => (
            <ChatMessageItem
              key={msg.id}
              message={msg}
              isStreaming={msg.id === streamingAssistantId}
            />
          ))
        )}
      </div>

      <div className="border-t border-[var(--border-subtle)] p-4">
        <div className="flex items-end gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] pr-1 focus-within:border-[var(--accent-teal-dim)]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!apiKeySet}
            rows={1}
            placeholder={placeholder}
            className="flex-1 resize-none bg-transparent px-3 py-2.5 text-[14px] leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none disabled:cursor-not-allowed"
          />
          {isStreaming ? (
            <button
              onClick={onAbort}
              className="rounded-md bg-rose-500/80 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-rose-500"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={!canSend}
              className="rounded-md bg-[var(--accent-teal)] px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
            >
              Send
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          Enter to send · Shift+Enter for newline · full transcript is included
          as context
        </p>
      </div>
    </section>
  );
}

function ChatEmptyState({ apiKeySet }: { apiKeySet: boolean }) {
  const title = apiKeySet ? "No messages yet" : "Add your Groq API key";
  const body = apiKeySet
    ? "Click any suggestion in the middle column to expand it into a detailed answer here, or type a question about the meeting directly."
    : "Open Settings and paste your Groq API key to enable chat.";
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="max-w-[280px] space-y-2">
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">
          {title}
        </p>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          {body}
        </p>
      </div>
    </div>
  );
}

function ChatMessageItem({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming: boolean;
}) {
  if (message.role === "user") {
    const meta = message.linkedSuggestion
      ? SUGGESTION_TYPE_META[message.linkedSuggestion.type]
      : null;
    return (
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]">
          <span className="text-[var(--text-muted)]">YOU</span>
          {meta && (
            <>
              <span className="text-[var(--text-muted)]">·</span>
              <span className={meta.badgeText}>{meta.label}</span>
            </>
          )}
        </div>
        <div
          className={`rounded-md border border-[var(--border-subtle)] ${meta ? `border-l-4 ${meta.border}` : ""} bg-[var(--bg-card)] px-3.5 py-2.5 text-[14px] leading-relaxed text-[var(--text-primary)]`}
        >
          {message.content}
        </div>
      </div>
    );
  }
  return <AssistantMessage message={message} isStreaming={isStreaming} />;
}

function AssistantMessage({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const canCopy = !isStreaming && message.content.length > 0;

  const onCopy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="group">
      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        <span>Assistant</span>
        {isStreaming && (
          <span className="flex items-center gap-1 text-[var(--accent-teal)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-teal)] animate-pulse-soft" />
            streaming
          </span>
        )}
        {canCopy && (
          <button
            onClick={onCopy}
            className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium tracking-[0.12em] text-[var(--text-muted)] opacity-0 transition hover:text-[var(--text-primary)] group-hover:opacity-100"
            aria-label="Copy assistant message"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <div className="chat-markdown px-0.5 text-[14px] leading-relaxed text-[var(--text-primary)]">
        {message.content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        ) : isStreaming ? (
          <span className="text-[var(--text-muted)]">…</span>
        ) : null}
        {isStreaming && message.content && (
          <span className="ml-0.5 inline-block h-[14px] w-[2px] -translate-y-[1px] animate-pulse-soft bg-[var(--accent-teal)] align-middle" />
        )}
      </div>
    </div>
  );
}
