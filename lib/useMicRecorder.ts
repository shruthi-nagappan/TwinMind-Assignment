"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseMicRecorderOptions {
  chunkMs: number;
  onChunk: (blob: Blob) => void;
  onError?: (err: Error) => void;
}

export interface UseMicRecorderState {
  isRecording: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported(t)
    ) {
      return t;
    }
  }
  return "";
}

/**
 * Mic recorder that emits a complete, standalone audio blob every `chunkMs` ms.
 *
 * Internally uses a stop/restart pattern: each chunk is a fresh MediaRecorder
 * session, which guarantees the resulting blob is a valid standalone webm/opus
 * file that Whisper can decode without needing the original stream header.
 */
export function useMicRecorder({
  chunkMs,
  onChunk,
  onError,
}: UseMicRecorderOptions): UseMicRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(false);
  const onChunkRef = useRef(onChunk);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const startChunk = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !isActiveRef.current) return;

    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    const parts: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) parts.push(e.data);
    };

    recorder.onstop = () => {
      if (parts.length > 0) {
        const blob = new Blob(parts, { type: mimeType || "audio/webm" });
        try {
          onChunkRef.current(blob);
        } catch (err) {
          onErrorRef.current?.(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
      if (isActiveRef.current) startChunk();
    };

    recorder.onerror = (e: Event) => {
      const errEvt = e as Event & { error?: Error };
      onErrorRef.current?.(errEvt.error ?? new Error("MediaRecorder error"));
    };

    recorderRef.current = recorder;
    recorder.start();

    chunkTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, chunkMs);
  }, [chunkMs]);

  const start = useCallback(async () => {
    setError(null);
    if (isActiveRef.current) return;

    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error("Microphone API not available in this browser");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      isActiveRef.current = true;
      setIsRecording(true);
      startChunk();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Microphone permission denied. Enable it in your browser settings and try again."
            : err.message
          : "Failed to access microphone";
      setError(message);
      isActiveRef.current = false;
      setIsRecording(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [startChunk]);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    setIsRecording(false);

    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { isRecording, error, start, stop };
}
