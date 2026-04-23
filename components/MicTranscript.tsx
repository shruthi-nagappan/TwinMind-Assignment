"use client";

import { useEffect, useRef } from "react";
import type { TranscriptChunk } from "@/lib/types";

interface MicTranscriptProps {
  transcript: TranscriptChunk[];
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  onToggle: () => void;
  onDismissError: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

export default function MicTranscript({
  transcript,
  isRecording,
  isTranscribing,
  error,
  onToggle,
  onDismissError,
  disabled,
  disabledReason,
}: MicTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript.length, isTranscribing]);

  const statusLabel = isRecording
    ? transcript.length === 0
      ? "Recording… first chunk in ~30s"
      : "Recording…"
    : "Stopped. Click to resume.";

  return (
    <>
      <div className="flex items-center gap-4 px-6 pt-5">
        <button
          onClick={onToggle}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          className={`group relative flex h-11 w-11 items-center justify-center rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-[var(--accent-teal)] focus:ring-offset-2 focus:ring-offset-[var(--bg-panel)] ${
            isRecording
              ? "border-rose-400 bg-rose-500"
              : "border-[var(--accent-teal)] bg-sky-500"
          } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:brightness-110"}`}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          <span
            className={`rounded-full border-2 bg-[var(--bg-panel)] ${
              isRecording
                ? "h-3.5 w-3.5 border-rose-400 animate-pulse-soft"
                : "h-5 w-5 border-[var(--accent-teal)]"
            }`}
          />
          {isRecording && (
            <span className="absolute -inset-1 rounded-full border-2 border-rose-400/40 animate-pulse-soft" />
          )}
        </button>
        <div className="flex-1">
          <p className="text-[15px] text-[var(--text-primary)]">{statusLabel}</p>
          {isTranscribing && (
            <p className="text-[11px] text-[var(--text-muted)]">
              Transcribing latest chunk…
            </p>
          )}
          {disabled && disabledReason && (
            <p className="text-[11px] text-amber-300/80">{disabledReason}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-start justify-between gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">
          <span className="flex-1">{error}</span>
          <button
            onClick={onDismissError}
            className="text-rose-300 hover:text-rose-100"
            aria-label="Dismiss error"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      <div className="mx-6 mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-4 py-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
        The transcript scrolls and appends new chunks every ~30 seconds while
        recording. Use the mic button to start/stop. Each chunk is transcribed
        independently via Whisper Large V3.
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {transcript.length === 0 && !isRecording && (
          <EmptyState>
            Click the mic to start. Transcript chunks will appear here every
            ~30 seconds.
          </EmptyState>
        )}
        {transcript.length === 0 && isRecording && (
          <EmptyState>
            Recording… first transcript chunk will appear in ~30 seconds.
          </EmptyState>
        )}
        {transcript.map((chunk) => (
          <div key={chunk.id} className="text-[14px] leading-relaxed">
            <span className="mr-2 font-mono text-[11px] uppercase tracking-wide text-violet-300/70">
              {chunk.timestamp}
            </span>
            <span className="text-[var(--text-primary)]">{chunk.text}</span>
          </div>
        ))}
        {isTranscribing && (
          <div className="text-[13px] italic text-[var(--text-muted)] animate-pulse-soft">
            Transcribing latest chunk…
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="max-w-xs text-center text-[13px] text-[var(--text-muted)]">
        {children}
      </p>
    </div>
  );
}
