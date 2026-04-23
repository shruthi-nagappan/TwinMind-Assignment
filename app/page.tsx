"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import MicTranscript from "@/components/MicTranscript";
import SettingsModal from "@/components/SettingsModal";
import SuggestionCard from "@/components/SuggestionCard";
import { DEFAULT_SETTINGS, SUGGESTION_TYPE_META } from "@/lib/prompts";
import { useMicRecorder } from "@/lib/useMicRecorder";
import type {
  AppSettings,
  ChatMessage,
  SuggestionBatch,
  TranscriptChunk,
} from "@/lib/types";

const API_KEY_STORAGE = "twinmind.groq_api_key";
const SETTINGS_STORAGE = "twinmind.settings";

// Day 1 demo content — Suggestions/Chat columns. Replaced by real state in
// Day 3 and Day 5 respectively. The Transcript column is now fully live.
const SAMPLE_BATCHES: SuggestionBatch[] = [
  {
    id: "b4",
    timestamp: "03:49:16 PM",
    transcriptWordCount: 54,
    suggestions: [
      {
        id: "s1",
        type: "answer",
        preview:
          "For state-in-memory issues: Redis Cluster + consistent hashing handles ~1M ops/sec/node.",
        detail_hint: "Expand on Redis Cluster topology and failover behavior.",
        meeting_phase: "deep_dive",
      },
      {
        id: "s2",
        type: "fact_check",
        preview:
          "Discord publicly serves ~15M concurrent voice users on Elixir/Erlang infra.",
        detail_hint: "Cite the Discord engineering blog post on this number.",
        meeting_phase: "deep_dive",
      },
      {
        id: "s3",
        type: "question_to_ask",
        preview:
          "What's your read/write ratio? That changes the sharding strategy significantly.",
        detail_hint: "Discuss read-heavy vs write-heavy sharding tradeoffs.",
        meeting_phase: "deep_dive",
      },
    ],
  },
  {
    id: "b3",
    timestamp: "03:48:46 PM",
    transcriptWordCount: 34,
    suggestions: [
      {
        id: "s4",
        type: "answer",
        preview:
          "Managed Kafka (MSK) at ~1M events/sec runs roughly $8–15k/mo on AWS.",
        detail_hint: "Compare against self-hosted Kafka on Graviton.",
        meeting_phase: "deep_dive",
      },
    ],
  },
];

const SAMPLE_CHAT: ChatMessage[] = [
  {
    id: "c1",
    role: "user",
    timestamp: "03:49:22 PM",
    content: "What's your current p99 latency on websocket round-trips?",
    linkedSuggestion: {
      type: "question_to_ask",
      preview: "What's your current p99 latency on websocket round-trips?",
    },
  },
  {
    id: "c2",
    role: "assistant",
    timestamp: "03:49:24 PM",
    content:
      'Detailed answer to: "What\'s your current p99 latency on websocket round-trips?"\n\nThis is where a separate, longer-form prompt runs against the chat model with full transcript context. Streamed response ideally. Candidates choose model + prompt strategy — we evaluate quality, latency, relevance.',
  },
  {
    id: "c3",
    role: "user",
    timestamp: "03:49:40 PM",
    content: "Managed Kafka (MSK) at ~1M events/sec runs roughly $8–15k/mo on AWS.",
    linkedSuggestion: {
      type: "answer",
      preview:
        "Managed Kafka (MSK) at ~1M events/sec runs roughly $8–15k/mo on AWS.",
    },
  },
  {
    id: "c4",
    role: "assistant",
    timestamp: "03:49:42 PM",
    content:
      'Detailed answer to: "Managed Kafka (MSK) at ~1M events/sec runs roughly $8–15k/mo on AWS."\n\nThis is where a separate, longer-form prompt runs against the chat model…',
  },
];

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

      setTranscript((prev) => [
        ...prev,
        {
          id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text,
          timestamp,
          wordCount: countWords(text),
        },
      ]);
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
        />
        <SuggestionsColumn batches={SAMPLE_BATCHES} />
        <ChatColumn chat={SAMPLE_CHAT} />
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
}: {
  transcript: TranscriptChunk[];
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  onToggleRecord: () => void;
  onDismissError: () => void;
  disabled?: boolean;
  disabledReason?: string;
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
      />
    </section>
  );
}

function SuggestionsColumn({ batches }: { batches: SuggestionBatch[] }) {
  const totalBatches = batches.length;
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-xl shadow-black/40">
      <ColumnHeader
        index={2}
        title="Live Suggestions"
        badge={`${totalBatches} ${totalBatches === 1 ? "Batch" : "Batches"}`}
      />
      <div className="flex items-center justify-between px-6 pt-4">
        <button
          disabled
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent-teal-dim)] bg-transparent px-3 py-1.5 text-[13px] font-medium text-[var(--accent-teal)] opacity-90"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0 1 14.32-4.9M20 14a8 8 0 0 1-14.32 4.9"
            />
          </svg>
          Reload suggestions
        </button>
        <span className="text-[12px] text-[var(--text-muted)]">
          auto-refresh idle (Day 3)
        </span>
      </div>
      <InfoBox>
        On reload (or auto every ~30s), generate{" "}
        <span className="font-semibold text-[var(--text-primary)]">
          3 fresh suggestions
        </span>{" "}
        from recent transcript context. New batch appears at the top; older
        batches push down (faded). Each is a tappable card: a{" "}
        <span className="text-sky-300">question to ask</span>, a{" "}
        <span className="text-violet-300">talking point</span>, an{" "}
        <span className="text-emerald-300">answer</span>, or a{" "}
        <span className="text-amber-300">fact-check</span>.
      </InfoBox>
      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {batches.map((batch, batchIdx) => (
          <div key={batch.id} className="space-y-3">
            {batchIdx > 0 && (
              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Batch {totalBatches - batchIdx} · {batch.timestamp}
                </span>
                <div className="h-px flex-1 bg-[var(--border-subtle)]" />
              </div>
            )}
            {batch.suggestions.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} faded={batchIdx > 0} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ChatColumn({ chat }: { chat: ChatMessage[] }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-xl shadow-black/40">
      <ColumnHeader
        index={3}
        title="Chat (Detailed Answers)"
        badge="Session-only"
      />
      <InfoBox>
        Clicking a suggestion adds it to this chat and streams a detailed
        answer (separate prompt, more context). User can also type questions
        directly. One continuous chat per session — no login, no persistence.
      </InfoBox>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {chat.map((msg) => (
          <ChatMessageItem key={msg.id} message={msg} />
        ))}
      </div>
      <div className="border-t border-[var(--border-subtle)] p-4">
        <div className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] pr-1">
          <input
            disabled
            placeholder="Ask anything… (Day 5)"
            className="flex-1 bg-transparent px-3 py-2.5 text-[14px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
          />
          <button
            disabled
            className="rounded-md bg-[var(--accent-teal-dim)] px-4 py-2 text-[13px] font-medium text-white opacity-90"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}

function ChatMessageItem({ message }: { message: ChatMessage }) {
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
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        Assistant
      </div>
      <div className="space-y-2 whitespace-pre-wrap px-0.5 text-[14px] leading-relaxed text-[var(--text-primary)]">
        {message.content}
      </div>
    </div>
  );
}
