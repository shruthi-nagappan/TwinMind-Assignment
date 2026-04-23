"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseMicRecorderOptions {
  chunkMs: number;
  onChunk: (blob: Blob) => void;
  onError?: (err: Error) => void;
  /** Peak RMS level (0..1) below which a chunk is considered silent and is
   *  NOT uploaded to Whisper. Whisper hallucinates badly on silence — this is
   *  the primary defense. Default 0.012 is conservative (lets quiet speech
   *  through, rejects ambient mic noise and muted mics). */
  silenceRmsThreshold?: number;
  /** When true, surface dropped-silent-chunk events via onSilentChunk. Useful
   *  for the UI to show "mostly silent — keep talking" hints. */
  onSilentChunk?: (peakRms: number) => void;
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

const DEFAULT_SILENCE_RMS = 0.012;

/**
 * Mic recorder that emits a complete, standalone audio blob every `chunkMs` ms.
 *
 * Internally uses a stop/restart pattern: each chunk is a fresh MediaRecorder
 * session, which guarantees the resulting blob is a valid standalone webm/opus
 * file that Whisper can decode without needing the original stream header.
 *
 * Additionally runs a parallel AnalyserNode on the stream to compute peak RMS
 * over the chunk window. Silent chunks (below `silenceRmsThreshold`) are
 * dropped and never uploaded — this prevents the well-known Whisper
 * hallucinations on silence ("you", "Thanks for watching.", "It's free.", etc).
 */
export function useMicRecorder({
  chunkMs,
  onChunk,
  onError,
  silenceRmsThreshold = DEFAULT_SILENCE_RMS,
  onSilentChunk,
}: UseMicRecorderOptions): UseMicRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(false);
  const onChunkRef = useRef(onChunk);
  const onErrorRef = useRef(onError);
  const onSilentChunkRef = useRef(onSilentChunk);

  // Audio analysis (for silence detection) runs alongside the recorder.
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onSilentChunkRef.current = onSilentChunk;
  }, [onSilentChunk]);

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

    // Peak-RMS sampler for this chunk window. Reset on every new chunk.
    let peakRms = 0;
    let rmsTimerId: ReturnType<typeof setInterval> | null = null;
    const analyser = analyserRef.current;
    if (analyser) {
      const buf = new Float32Array(analyser.fftSize);
      rmsTimerId = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        if (rms > peakRms) peakRms = rms;
      }, 80);
    }

    recorder.onstop = () => {
      if (rmsTimerId !== null) {
        clearInterval(rmsTimerId);
        rmsTimerId = null;
      }
      if (parts.length > 0) {
        const isSilent = peakRms < silenceRmsThreshold;
        if (isSilent) {
          // Drop the chunk — Whisper will hallucinate on it. Notify UI so it
          // can show a hint without spamming errors.
          onSilentChunkRef.current?.(peakRms);
        } else {
          const blob = new Blob(parts, { type: mimeType || "audio/webm" });
          try {
            onChunkRef.current(blob);
          } catch (err) {
            onErrorRef.current?.(
              err instanceof Error ? err : new Error(String(err)),
            );
          }
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
  }, [chunkMs, silenceRmsThreshold]);

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

      // Ask for the cleanest capture we can get. AEC/NS/AGC help reduce
      // background noise that Whisper can mistake for speech.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Set up analyser for silence detection. This is a cheap passive graph
      // that reads the stream without routing audio anywhere.
      try {
        const AC: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ac = new AC();
        const source = ac.createMediaStreamSource(stream);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.2;
        source.connect(analyser);
        audioContextRef.current = ac;
        sourceRef.current = source;
        analyserRef.current = analyser;
      } catch (err) {
        // If AudioContext fails, we still record — just without silence
        // detection. Better to transcribe-and-maybe-hallucinate than to not
        // record at all.
        console.warn("[mic] silence detection unavailable:", err);
      }

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

  const teardownAudioGraph = useCallback(() => {
    try {
      sourceRef.current?.disconnect();
    } catch {
      // ignore
    }
    sourceRef.current = null;
    analyserRef.current = null;
    const ac = audioContextRef.current;
    if (ac && ac.state !== "closed") {
      ac.close().catch(() => {
        // ignore
      });
    }
    audioContextRef.current = null;
  }, []);

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
    teardownAudioGraph();
  }, [teardownAudioGraph]);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      teardownAudioGraph();
    };
  }, [teardownAudioGraph]);

  return { isRecording, error, start, stop };
}
