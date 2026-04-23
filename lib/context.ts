import type Groq from "groq-sdk";
import {
  DEFAULT_ROLLING_SUMMARY_PROMPT,
  GROQ_SUMMARY_MODEL,
} from "./prompts";
import type {
  MeetingPhase,
  SuggestionContext,
  TranscriptChunk,
} from "./types";

/**
 * Threshold above which we compress older transcript via a cheap Groq call.
 * Below this, we just include the raw older text as the summary (cheaper, no
 * extra round-trip).
 */
const ROLLING_SUMMARY_WORD_THRESHOLD = 800;
const ROLLING_SUMMARY_MAX_INPUT_WORDS = 4000;

export interface BuildContextArgs {
  chunks: TranscriptChunk[];
  windowWords: number;
  meetingStartTime: string | null;
  /** Optional Groq client. When provided and older transcript is long, we run
   *  a rolling-summary call to compress it; otherwise the summary is plain. */
  groq?: Groq;
}

function extractLastSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  // Match complete sentences ending in . ! ? (supports ellipsis)
  const matches = trimmed.match(/[^.!?\n]+[.!?]+/g);
  if (matches && matches.length > 0) {
    return matches[matches.length - 1].trim();
  }

  // No terminal punctuation — treat the whole text as the statement.
  // If it's very long, take just the last 25 words so last_statement stays
  // tight (it's the primary routing signal for the model).
  const words = trimmed.split(/\s+/);
  if (words.length <= 25) return trimmed;
  return "…" + words.slice(-25).join(" ");
}

function derivePhase(durationMinutes: number): MeetingPhase {
  if (durationMinutes < 5) return "opening";
  if (durationMinutes > 20) return "closing";
  return "deep_dive";
}

function splitWords(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

async function compressOlder({
  groq,
  olderText,
}: {
  groq: Groq;
  olderText: string;
}): Promise<string> {
  // Cap input size — if older transcript is enormous we only summarize the
  // most recent portion of "older" (which matters most for continuity).
  const words = splitWords(olderText);
  const input =
    words.length > ROLLING_SUMMARY_MAX_INPUT_WORDS
      ? words.slice(-ROLLING_SUMMARY_MAX_INPUT_WORDS).join(" ")
      : olderText;

  const resp = await groq.chat.completions.create({
    model: GROQ_SUMMARY_MODEL,
    temperature: 0.2,
    max_tokens: 400,
    messages: [
      { role: "system", content: DEFAULT_ROLLING_SUMMARY_PROMPT },
      { role: "user", content: input },
    ],
  });

  const text = resp.choices[0]?.message?.content?.trim() ?? "";
  return text;
}

/**
 * Build the hierarchical context the suggestion model receives.
 *
 *   MEETING_CONTEXT    — detected type (model infers), duration, phase
 *   MEETING_SUMMARY    — compressed older transcript (or raw if short)
 *   RECENT_TRANSCRIPT  — last `windowWords` words verbatim
 *   LAST_STATEMENT     — last complete sentence of the most recent chunk
 */
export async function buildSuggestionContext({
  chunks,
  windowWords,
  meetingStartTime,
  groq,
}: BuildContextArgs): Promise<SuggestionContext> {
  const joined = chunks.map((c) => c.text).join(" ").trim();
  const allWords = splitWords(joined);

  const recentWords = allWords.slice(-windowWords);
  const recent_transcript = recentWords.join(" ");

  const olderWords = allWords.slice(0, Math.max(0, allWords.length - windowWords));
  const olderText = olderWords.join(" ");

  let meeting_summary = "";
  if (olderWords.length > 0) {
    if (groq && olderWords.length > ROLLING_SUMMARY_WORD_THRESHOLD) {
      try {
        meeting_summary = await compressOlder({ groq, olderText });
      } catch (err) {
        // Fall back to truncated raw text if summary call fails — never block
        // the primary suggestion call on a summary failure.
        console.warn("[context] rolling summary failed, falling back:", err);
        meeting_summary = olderWords.slice(0, 400).join(" ");
      }
    } else {
      meeting_summary = olderText;
    }
  }

  const lastChunk = chunks[chunks.length - 1];
  const last_statement = lastChunk ? extractLastSentence(lastChunk.text) : "";

  let durationMinutes: number;
  if (meetingStartTime) {
    const started = new Date(meetingStartTime).getTime();
    durationMinutes = Math.max(0, (Date.now() - started) / 60000);
  } else {
    // Fallback: assume ~30s per chunk if start time not tracked yet.
    durationMinutes = (chunks.length * 30) / 60;
  }

  return {
    meeting_context: {
      detected_type: "unknown",
      duration_minutes: Math.round(durationMinutes * 10) / 10,
      phase: derivePhase(durationMinutes),
    },
    meeting_summary,
    recent_transcript,
    last_statement,
  };
}

/**
 * Render the SuggestionContext as the user-message input for the suggestion
 * prompt. Keeping this as its own function lets us A/B-test format variants.
 */
export function renderContextForPrompt(ctx: SuggestionContext): string {
  const parts: string[] = [];
  parts.push("MEETING_CONTEXT:");
  parts.push(`  detected_type: ${ctx.meeting_context.detected_type}`);
  parts.push(`  duration_minutes: ${ctx.meeting_context.duration_minutes}`);
  parts.push(`  phase: ${ctx.meeting_context.phase}`);
  parts.push("");

  if (ctx.meeting_summary) {
    parts.push("MEETING_SUMMARY (older transcript, compressed):");
    parts.push(ctx.meeting_summary);
    parts.push("");
  }

  parts.push("RECENT_TRANSCRIPT (verbatim):");
  parts.push(ctx.recent_transcript || "(no recent transcript)");
  parts.push("");

  parts.push("LAST_STATEMENT (most recent utterance — primary signal):");
  parts.push(ctx.last_statement || "(silence / no clear last statement)");
  parts.push("");

  parts.push(
    "Now perform your silent Step 1 analysis, then return the JSON object per the schema.",
  );

  return parts.join("\n");
}
