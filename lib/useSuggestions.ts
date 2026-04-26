"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppSettings,
  SuggestionBatch,
  SuggestionsApiResponse,
  TranscriptChunk,
} from "./types";

export interface UseSuggestionsOptions {
  transcript: TranscriptChunk[];
  meetingStartTime: string | null;
  apiKey: string;
  settings: AppSettings;
  /** When false, auto-refresh is paused (e.g. user stopped recording). */
  enabled: boolean;
}

export interface UseSuggestionsResult {
  batches: SuggestionBatch[];
  isLoading: boolean;
  error: string | null;
  lastRefreshedAt: Date | null;
  /** Seconds until the next auto-refresh will fire; null when paused. */
  nextRefreshInSeconds: number | null;
  /** Manual reload. `force: true` bypasses change-detection. */
  refresh: (opts?: { force?: boolean }) => Promise<void>;
  clearError: () => void;
  clearAll: () => void;
  /** Day 9 — restore batches from an imported session export. */
  hydrateBatches: (batches: SuggestionBatch[]) => void;
}

/** Minimum transcript words before the first auto-batch fires. ~8s of speech. */
const FIRST_BATCH_MIN_WORDS = 20;
const BATCHES_MAX_HISTORY = 10;

function formatClockTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function countTranscriptWords(chunks: TranscriptChunk[]): number {
  return chunks.reduce((sum, c) => sum + (c.wordCount || 0), 0);
}

export function useSuggestions({
  transcript,
  meetingStartTime,
  apiKey,
  settings,
  enabled,
}: UseSuggestionsOptions): UseSuggestionsResult {
  const [batches, setBatches] = useState<SuggestionBatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [nextRefreshInSeconds, setNextRefreshInSeconds] = useState<number | null>(
    null,
  );

  // Refs mirror the latest props so async callbacks + intervals can read
  // current values without forcing the callbacks to re-create on every render.
  const transcriptRef = useRef(transcript);
  const meetingStartRef = useRef(meetingStartTime);
  const apiKeyRef = useRef(apiKey);
  const settingsRef = useRef(settings);
  const enabledRef = useRef(enabled);
  const batchesRef = useRef(batches);
  const inFlightRef = useRef(false);
  const lastAttemptAtRef = useRef<number>(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const prevEnabledRef = useRef(enabled);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  useEffect(() => {
    meetingStartRef.current = meetingStartTime;
  }, [meetingStartTime]);
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    batchesRef.current = batches;
  }, [batches]);

  // When recording resumes after a pause, reset the countdown so the user
  // isn't hit with an immediate stale-interval fire the moment they resume.
  useEffect(() => {
    if (enabled && !prevEnabledRef.current) {
      lastAttemptAtRef.current = Date.now();
    }
    prevEnabledRef.current = enabled;
  }, [enabled]);

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    if (inFlightRef.current) return;

    const key = apiKeyRef.current;
    const chunks = transcriptRef.current;
    const s = settingsRef.current;

    if (!key) {
      setError("No Groq API key set. Open Settings to paste your key.");
      return;
    }
    if (chunks.length === 0) {
      // Silently ignore auto-refresh when there's nothing to work with.
      if (opts?.force) {
        setError("No transcript yet — start recording to generate suggestions.");
      }
      return;
    }

    // Change detection — skip silently for auto-refresh when the transcript
    // hasn't grown by at least `skipRegenerationThreshold` words since the
    // last batch. Manual (force) always runs.
    if (!opts?.force && batchesRef.current.length > 0) {
      const currentWords = countTranscriptWords(chunks);
      const lastBatchWords = batchesRef.current[0].transcriptWordCount;
      const delta = currentWords - lastBatchWords;
      if (delta < s.skipRegenerationThreshold) {
        lastAttemptAtRef.current = Date.now();
        return;
      }
    }

    // Mark the attempt timestamp immediately so the countdown resets on both
    // success AND failure paths (avoids retry-storming on persistent errors).
    lastAttemptAtRef.current = Date.now();
    inFlightRef.current = true;
    setIsLoading(true);
    setError(null);

    // Cancel any stale in-flight request (shouldn't happen due to guard
    // above, but cheap insurance against races on rapid prop updates).
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const prior = batchesRef.current[0]?.suggestions;
      const previousSuggestionPreviews =
        prior && prior.length > 0
          ? prior.map((x) => `${x.type}: ${x.preview}`)
          : undefined;

      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-api-key": key,
        },
        body: JSON.stringify({
          transcript: chunks,
          meetingStartTime: meetingStartRef.current,
          ...(previousSuggestionPreviews
            ? { previousSuggestionPreviews }
            : {}),
          settings: {
            suggestionPrompt: s.suggestionPrompt,
            rollingSummaryPrompt: s.rollingSummaryPrompt,
            suggestionContextWindow: s.suggestionContextWindow,
            suggestionTemperature: s.suggestionTemperature,
          },
        }),
        signal: ac.signal,
      });

      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: `Suggestions failed (${res.status})` }));
        throw new Error(errBody.error || `Suggestions failed (${res.status})`);
      }

      const data = (await res.json()) as SuggestionsApiResponse;
      const now = new Date();
      const newBatch: SuggestionBatch = {
        id: `b-${now.getTime()}`,
        suggestions: data.suggestions,
        timestamp: formatClockTime(now),
        transcriptWordCount: countTranscriptWords(chunks),
        meetingType: data.meeting_type,
      };
      setBatches((prev) => [newBatch, ...prev].slice(0, BATCHES_MAX_HISTORY));
      setLastRefreshedAt(now);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Suggestions failed";
      setError(msg);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
      abortRef.current = null;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearAll = useCallback(() => {
    setBatches([]);
    setLastRefreshedAt(null);
    setError(null);
  }, []);

  const hydrateBatches = useCallback((next: SuggestionBatch[]) => {
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightRef.current = false;
    setIsLoading(false);
    setError(null);
    setBatches(next.slice(0, BATCHES_MAX_HISTORY));
    setLastRefreshedAt(null);
    lastAttemptAtRef.current = Date.now();
  }, []);

  // Kickstart: when we first have meaningful transcript content and no
  // batches yet, fire immediately so the user isn't waiting the full
  // interval for their first suggestions.
  useEffect(() => {
    if (!enabled || !apiKey) return;
    if (batches.length > 0) return;
    if (inFlightRef.current) return;
    const words = countTranscriptWords(transcript);
    if (words < FIRST_BATCH_MIN_WORDS) return;
    void refresh({ force: true });
  }, [transcript, enabled, apiKey, batches.length, refresh]);

  // Ticking auto-refresh + countdown display.
  useEffect(() => {
    const intervalMs =
      Math.max(5, settings.refreshIntervalSeconds || 30) * 1000;

    const tick = () => {
      if (!enabledRef.current) {
        setNextRefreshInSeconds(null);
        return;
      }
      const remainingMs = Math.max(
        0,
        intervalMs - (Date.now() - lastAttemptAtRef.current),
      );
      setNextRefreshInSeconds(Math.ceil(remainingMs / 1000));
      if (remainingMs === 0 && !inFlightRef.current) {
        void refresh({ force: false });
      }
    };

    tick();
    const tickId = setInterval(tick, 1000);
    return () => clearInterval(tickId);
  }, [settings.refreshIntervalSeconds, refresh]);

  return {
    batches,
    isLoading,
    error,
    lastRefreshedAt,
    nextRefreshInSeconds,
    refresh,
    clearError,
    clearAll,
    hydrateBatches,
  };
}
