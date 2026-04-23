import { NextRequest, NextResponse } from "next/server";
import { createGroqClient, getApiKeyFromRequest } from "@/lib/groq";
import {
  DEFAULT_CHAT_SYSTEM_PROMPT,
  DEFAULT_DETAILED_ANSWER_PROMPT,
  GROQ_CHAT_MODEL,
} from "@/lib/prompts";
import type {
  ChatMessage,
  MeetingType,
  Suggestion,
  TranscriptChunk,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequestBody {
  mode?: "chat" | "detailed_answer";
  messages?: ChatMessage[];
  transcript?: TranscriptChunk[];
  detectedMeetingType?: MeetingType | null;
  linkedSuggestion?: Pick<Suggestion, "type" | "preview" | "detail_hint"> | null;
  settings?: {
    chatSystemPrompt?: string;
    detailedAnswerPrompt?: string;
    chatTemperature?: number;
    expandedContextWindow?: number;
  };
}

const DEFAULT_EXPANDED_WINDOW_WORDS = 4000;
const DEFAULT_CHAT_TEMPERATURE = 0.4;

function renderTranscript(
  chunks: TranscriptChunk[],
  maxWords: number,
): string {
  if (chunks.length === 0) return "(no transcript yet)";
  const joined = chunks.map((c) => c.text).join(" ").trim();
  const words = joined.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return joined;
  // Keep the tail — the most recent content is the most valuable context for
  // grounding the chat response.
  return "…" + words.slice(-maxWords).join(" ");
}

function buildSystemMessage({
  mode,
  systemPromptOverride,
  transcriptText,
  detectedMeetingType,
  linkedSuggestion,
}: {
  mode: "chat" | "detailed_answer";
  systemPromptOverride: string;
  transcriptText: string;
  detectedMeetingType: MeetingType | null;
  linkedSuggestion:
    | Pick<Suggestion, "type" | "preview" | "detail_hint">
    | null;
}): string {
  const parts: string[] = [systemPromptOverride.trim()];

  parts.push("\n---\nMEETING CONTEXT");
  if (detectedMeetingType) {
    parts.push(`detected_meeting_type: ${detectedMeetingType}`);
  }

  parts.push("\nFULL MEETING TRANSCRIPT (use this to ground your answer):");
  parts.push(transcriptText);

  if (mode === "detailed_answer" && linkedSuggestion) {
    parts.push("\n---\nTHE USER CLICKED THIS SUGGESTION TO EXPAND:");
    parts.push(`type: ${linkedSuggestion.type}`);
    parts.push(`preview: ${linkedSuggestion.preview}`);
    if (linkedSuggestion.detail_hint) {
      parts.push(`detail_hint: ${linkedSuggestion.detail_hint}`);
    }
    parts.push(
      "\nProduce the detailed, expanded version of this suggestion as instructed in your system prompt above.",
    );
  }

  return parts.join("\n");
}

export async function POST(req: NextRequest) {
  let apiKey: string;
  try {
    apiKey = getApiKeyFromRequest(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Missing API key";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode === "detailed_answer" ? "detailed_answer" : "chat";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const transcript = Array.isArray(body.transcript) ? body.transcript : [];
  const detectedMeetingType = body.detectedMeetingType ?? null;
  const linkedSuggestion = body.linkedSuggestion ?? null;
  const settings = body.settings ?? {};

  // In detailed_answer mode we don't require prior chat history — clicking
  // a suggestion is a one-shot expansion request. In chat mode we require at
  // least one user message to respond to.
  if (mode === "chat" && messages.length === 0) {
    return NextResponse.json(
      { error: "Provide a non-empty 'messages' array." },
      { status: 400 },
    );
  }

  const systemPromptOverride =
    mode === "detailed_answer"
      ? settings.detailedAnswerPrompt?.trim() || DEFAULT_DETAILED_ANSWER_PROMPT
      : settings.chatSystemPrompt?.trim() || DEFAULT_CHAT_SYSTEM_PROMPT;

  const expandedWords =
    settings.expandedContextWindow ?? DEFAULT_EXPANDED_WINDOW_WORDS;
  const temperature =
    settings.chatTemperature ?? DEFAULT_CHAT_TEMPERATURE;

  const transcriptText = renderTranscript(transcript, expandedWords);

  const systemContent = buildSystemMessage({
    mode,
    systemPromptOverride,
    transcriptText,
    detectedMeetingType,
    linkedSuggestion,
  });

  // Map our stored chat history onto Groq's chat message shape. We keep only
  // role + content (no UI metadata like ids/timestamps).
  const groqMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContent },
  ];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content !== "string" || !m.content.trim()) continue;
    groqMessages.push({ role: m.role, content: m.content });
  }

  const groq = createGroqClient(apiKey);

  let stream;
  try {
    stream = await groq.chat.completions.create({
      model: GROQ_CHAT_MODEL,
      temperature,
      max_tokens: 1200,
      stream: true,
      messages: groqMessages,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Groq call failed";
    console.error("[/api/chat]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Pipe Groq's SDK async-iterable into a ReadableStream of plain text bytes.
  // Client reads with response.body.getReader() and appends each chunk to the
  // streaming assistant message.
  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          const token = event.choices?.[0]?.delta?.content ?? "";
          if (token) {
            controller.enqueue(encoder.encode(token));
          }
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        console.error("[/api/chat] stream error:", msg);
        // Surface the error to the client as a final trailer so it's visible
        // in the streamed text, not silently swallowed.
        try {
          controller.enqueue(
            encoder.encode(`\n\n[stream error: ${msg}]`),
          );
        } catch {
          // controller already closed
        }
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
