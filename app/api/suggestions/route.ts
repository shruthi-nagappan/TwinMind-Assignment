import { NextRequest, NextResponse } from "next/server";
import type Groq from "groq-sdk";
import { createGroqClient, getApiKeyFromRequest } from "@/lib/groq";
import {
  buildSuggestionContext,
  renderContextForPrompt,
} from "@/lib/context";
import {
  DEFAULT_SUGGESTION_PROMPT,
  GROQ_CHAT_MODEL,
} from "@/lib/prompts";
import type {
  MeetingPhase,
  MeetingType,
  Suggestion,
  SuggestionType,
  TranscriptChunk,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_TYPES = new Set<SuggestionType>([
  "answer",
  "fact_check",
  "question_to_ask",
  "talking_point",
]);
const VALID_PHASES = new Set<MeetingPhase>([
  "opening",
  "deep_dive",
  "closing",
]);
const VALID_MEETING_TYPES = new Set<MeetingType>([
  "interview",
  "sales_call",
  "brainstorm",
  "technical_sync",
  "lecture",
  "one_on_one",
  "generic",
]);

interface SuggestionsRequestBody {
  transcript?: TranscriptChunk[];
  meetingStartTime?: string | null;
  settings?: {
    suggestionPrompt?: string;
    rollingSummaryPrompt?: string;
    suggestionContextWindow?: number;
    suggestionTemperature?: number;
  };
}

interface ParsedResponse {
  meeting_type: MeetingType;
  suggestions: Suggestion[];
}

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences if the model ignored the rule.
  const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) s = fenceMatch[1].trim();
  return s;
}

function parseAndValidate(raw: string): ParsedResponse | { error: string } {
  const cleaned = stripJsonFences(raw);

  // Some models still prefix an explanation before the JSON. Salvage by
  // slicing from the first "{" to the last "}".
  let jsonText = cleaned;
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first > 0 && last > first) {
    jsonText = cleaned.slice(first, last + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { error: `JSON parse failed: ${(e as Error).message}` };
  }

  if (!parsed || typeof parsed !== "object") {
    return { error: "Response is not a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;

  const mt = typeof obj.meeting_type === "string" ? obj.meeting_type : "generic";
  const meeting_type = (VALID_MEETING_TYPES.has(mt as MeetingType)
    ? mt
    : "generic") as MeetingType;

  const sugArr = obj.suggestions;
  if (!Array.isArray(sugArr)) {
    return { error: "'suggestions' is not an array" };
  }
  if (sugArr.length !== 3) {
    return {
      error: `Expected exactly 3 suggestions, got ${sugArr.length}`,
    };
  }

  const out: Suggestion[] = [];
  for (let i = 0; i < sugArr.length; i++) {
    const s = sugArr[i];
    if (!s || typeof s !== "object") {
      return { error: `Suggestion ${i} is not an object` };
    }
    const rec = s as Record<string, unknown>;

    const type = rec.type;
    if (typeof type !== "string" || !VALID_TYPES.has(type as SuggestionType)) {
      return { error: `Suggestion ${i} has invalid type: ${String(type)}` };
    }

    const preview = rec.preview;
    if (typeof preview !== "string" || !preview.trim()) {
      return { error: `Suggestion ${i} has empty preview` };
    }

    const detail_hint =
      typeof rec.detail_hint === "string" ? rec.detail_hint : "";

    const phase = rec.meeting_phase;
    const meeting_phase =
      typeof phase === "string" && VALID_PHASES.has(phase as MeetingPhase)
        ? (phase as MeetingPhase)
        : "deep_dive";

    out.push({
      id: `sug-${Date.now()}-${i}`,
      type: type as SuggestionType,
      preview: preview.trim(),
      detail_hint: detail_hint.trim(),
      meeting_phase,
    });
  }

  return { meeting_type, suggestions: out };
}

function isGroqJsonSchemaValidationError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : JSON.stringify(err);
  return (
    msg.includes("json_validate_failed") ||
    msg.includes("Failed to validate JSON")
  );
}

async function callGroqForSuggestions({
  groq,
  systemPrompt,
  userPrompt,
  temperature,
  strictify,
}: {
  groq: Groq;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  strictify: boolean;
}): Promise<string> {
  const finalSystem = strictify
    ? systemPrompt +
      "\n\nSTRICT MODE: Your last response was not valid JSON. Respond with ONLY the JSON object. No prose. No markdown fences. No keys other than the schema. Exactly 3 suggestions."
    : systemPrompt;

  const messages = [
    { role: "system" as const, content: finalSystem },
    { role: "user" as const, content: userPrompt },
  ];

  /** Extra headroom — truncated JSON makes Groq's json_object validator fail with 400. */
  const maxTokens = strictify ? 1200 : 1400;

  const create = (jsonObject: boolean) =>
    groq.chat.completions.create({
      model: GROQ_CHAT_MODEL,
      temperature,
      max_tokens: maxTokens,
      messages,
      ...(jsonObject ? { response_format: { type: "json_object" as const } } : {}),
    });

  // Strict internal retry: skip json_object — Groq rejects invalid generations
  // before we can salvage; our parseAndValidate already handles minor slop.
  if (strictify) {
    const resp = await create(false);
    return resp.choices[0]?.message?.content ?? "";
  }

  try {
    const resp = await create(true);
    return resp.choices[0]?.message?.content ?? "";
  } catch (err) {
    if (!isGroqJsonSchemaValidationError(err)) throw err;
    console.warn(
      "[/api/suggestions] Groq json_object validation failed, retrying without response_format",
    );
    const resp = await create(false);
    return resp.choices[0]?.message?.content ?? "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = getApiKeyFromRequest(req);

    let body: SuggestionsRequestBody;
    try {
      body = (await req.json()) as SuggestionsRequestBody;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { transcript, meetingStartTime, settings } = body;

    if (!Array.isArray(transcript) || transcript.length === 0) {
      return NextResponse.json(
        { error: "Provide a non-empty 'transcript' array of chunks." },
        { status: 400 },
      );
    }

    // Sanity-check each chunk has a text field.
    const totalText = transcript
      .map((c) => (typeof c?.text === "string" ? c.text : ""))
      .join(" ")
      .trim();
    if (!totalText) {
      return NextResponse.json(
        { error: "Transcript chunks have no text content." },
        { status: 400 },
      );
    }

    const windowWords = settings?.suggestionContextWindow ?? 1500;
    const temperature = settings?.suggestionTemperature ?? 0.7;
    const systemPrompt =
      settings?.suggestionPrompt?.trim() || DEFAULT_SUGGESTION_PROMPT;
    const rollingSummaryPrompt =
      settings?.rollingSummaryPrompt?.trim() || undefined;

    const groq = createGroqClient(apiKey);

    const context = await buildSuggestionContext({
      chunks: transcript,
      windowWords,
      meetingStartTime: meetingStartTime ?? null,
      groq,
      rollingSummaryPrompt,
    });

    const userPrompt = renderContextForPrompt(context);

    // First attempt.
    let rawContent = "";
    try {
      rawContent = await callGroqForSuggestions({
        groq,
        systemPrompt,
        userPrompt,
        temperature,
        strictify: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Groq call failed";
      console.error("[/api/suggestions] first call failed:", msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    let parsed = parseAndValidate(rawContent);

    // One retry with a stricter system prompt + lower temperature if the
    // first response doesn't validate.
    if ("error" in parsed) {
      console.warn(
        "[/api/suggestions] first response invalid, retrying:",
        parsed.error,
      );
      try {
        rawContent = await callGroqForSuggestions({
          groq,
          systemPrompt,
          userPrompt,
          temperature: Math.max(0.1, temperature - 0.3),
          strictify: true,
        });
        parsed = parseAndValidate(rawContent);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Groq retry failed";
        console.error("[/api/suggestions] retry failed:", msg);
        return NextResponse.json({ error: msg }, { status: 502 });
      }
    }

    if ("error" in parsed) {
      console.error(
        "[/api/suggestions] validation failed after retry:",
        parsed.error,
        "\nraw:",
        rawContent.slice(0, 500),
      );
      return NextResponse.json(
        {
          error: `Model returned invalid suggestions: ${parsed.error}`,
        },
        { status: 502 },
      );
    }

    // The model may have detected a more specific type than "unknown" — merge
    // it back into the returned context for the client/UI.
    const enrichedContext = {
      ...context,
      meeting_context: {
        ...context.meeting_context,
        detected_type: parsed.meeting_type,
      },
    };

    return NextResponse.json({
      suggestions: parsed.suggestions,
      meeting_type: parsed.meeting_type,
      context: enrichedContext,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Suggestions failed";
    console.error("[/api/suggestions]", msg);
    const status = msg.toLowerCase().includes("api key") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
