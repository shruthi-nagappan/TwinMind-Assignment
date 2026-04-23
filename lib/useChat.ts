"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppSettings,
  ChatMessage,
  MeetingType,
  Suggestion,
  TranscriptChunk,
} from "./types";

export interface UseChatOptions {
  transcript: TranscriptChunk[];
  detectedMeetingType: MeetingType | null;
  apiKey: string;
  settings: AppSettings;
}

export interface UseChatResult {
  messages: ChatMessage[];
  /** The assistant message currently being streamed in (if any). */
  streamingAssistantId: string | null;
  isStreaming: boolean;
  error: string | null;
  /** Send a free-form user message. */
  send: (content: string) => Promise<void>;
  /** Send a click-to-expand request for a specific suggestion. Streams the
   *  detailed answer as the assistant response. */
  expandSuggestion: (s: Suggestion) => Promise<void>;
  /** Abort the current in-flight stream (if any). */
  abort: () => void;
  clear: () => void;
  clearError: () => void;
}

function formatClockTime(d: Date = new Date()): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useChat({
  transcript,
  detectedMeetingType,
  apiKey,
  settings,
}: UseChatOptions): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingAssistantId, setStreamingAssistantId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Refs so the async streaming callback sees current values without
  // forcing `send` to re-create on every transcript chunk.
  const transcriptRef = useRef(transcript);
  const meetingTypeRef = useRef(detectedMeetingType);
  const apiKeyRef = useRef(apiKey);
  const settingsRef = useRef(settings);
  const messagesRef = useRef(messages);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  useEffect(() => {
    meetingTypeRef.current = detectedMeetingType;
  }, [detectedMeetingType]);
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const runStream = useCallback(
    async (args: {
      mode: "chat" | "detailed_answer";
      userMessage: ChatMessage;
      /** Only for detailed_answer mode. */
      linkedSuggestion?: Pick<Suggestion, "type" | "preview" | "detail_hint">;
    }) => {
      const key = apiKeyRef.current;
      if (!key) {
        setError("No Groq API key set. Open Settings to paste your key.");
        return;
      }

      // Append the user message immediately (optimistic UI). Also append a
      // placeholder assistant message that we'll stream content into.
      const assistantId = makeId("a");
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: formatClockTime(),
      };
      setMessages((prev) => [...prev, args.userMessage, assistantMessage]);
      setStreamingAssistantId(assistantId);
      setError(null);

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      // Build the history the server will see (excluding the placeholder).
      // We include the just-appended user message so the server treats it as
      // the current turn for chat-mode.
      const historyForServer: ChatMessage[] = [
        ...messagesRef.current,
        args.userMessage,
      ];

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-groq-api-key": key,
          },
          signal: ac.signal,
          body: JSON.stringify({
            mode: args.mode,
            messages: historyForServer,
            transcript: transcriptRef.current,
            detectedMeetingType: meetingTypeRef.current,
            linkedSuggestion: args.linkedSuggestion ?? null,
            settings: {
              chatSystemPrompt: settingsRef.current.chatSystemPrompt,
              detailedAnswerPrompt: settingsRef.current.detailedAnswerPrompt,
              chatTemperature: settingsRef.current.chatTemperature,
              expandedContextWindow:
                settingsRef.current.expandedContextWindow,
            },
          }),
        });

        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => ({}));
          const msg =
            (errBody as { error?: string }).error ||
            `Chat request failed (${res.status})`;
          throw new Error(msg);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          acc += decoder.decode(value, { stream: true });
          // Functional update so we don't stomp on concurrent state changes.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: acc } : m,
            ),
          );
        }
        // Flush final decoder state.
        acc += decoder.decode();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: acc } : m,
          ),
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + "\n\n[aborted]" }
                : m,
            ),
          );
          return;
        }
        const msg = err instanceof Error ? err.message : "Chat failed";
        setError(msg);
        // Remove the empty assistant placeholder on error so the UI doesn't
        // show a blank message. Keep the user message.
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setStreamingAssistantId(null);
      }
    },
    [],
  );

  const send = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const userMsg: ChatMessage = {
        id: makeId("u"),
        role: "user",
        content: trimmed,
        timestamp: formatClockTime(),
      };
      await runStream({ mode: "chat", userMessage: userMsg });
    },
    [runStream],
  );

  const expandSuggestion = useCallback(
    async (s: Suggestion) => {
      const userMsg: ChatMessage = {
        id: makeId("u"),
        role: "user",
        content: s.preview,
        timestamp: formatClockTime(),
        linkedSuggestion: { type: s.type, preview: s.preview },
      };
      await runStream({
        mode: "detailed_answer",
        userMessage: userMsg,
        linkedSuggestion: {
          type: s.type,
          preview: s.preview,
          detail_hint: s.detail_hint,
        },
      });
    },
    [runStream],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setStreamingAssistantId(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    messages,
    streamingAssistantId,
    isStreaming: streamingAssistantId !== null,
    error,
    send,
    expandSuggestion,
    abort,
    clear,
    clearError,
  };
}
