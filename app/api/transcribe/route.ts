import { NextRequest, NextResponse } from "next/server";
import { createGroqClient, getApiKeyFromRequest } from "@/lib/groq";
import { GROQ_WHISPER_MODEL } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Whisper (all sizes) has a well-known failure mode where it hallucinates
 * common YouTube-caption phrases when fed silent or near-silent audio. The
 * client-side silence detector drops most of these before they reach us, but
 * chunks with a few seconds of speech surrounded by silence can still slip
 * through and produce pure hallucinations. This set catches the worst
 * offenders; matched outputs are treated as silence.
 */
const WHISPER_HALLUCINATION_PATTERNS = new Set<string>([
  "you",
  "you you",
  "thank you",
  "thanks",
  "thanks for watching",
  "thank you for watching",
  "please subscribe",
  "please like and subscribe",
  "like and subscribe",
  "subscribe",
  "bye",
  "bye bye",
  "goodbye",
  "ok",
  "okay",
  "hmm",
  "uh",
  "um",
  "mhm",
  "it's free",
  "its free",
  "what am i getting on it",
  "see you next time",
  "see you",
  "cheers",
]);

function isLikelyHallucination(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:\u2026]+$/g, "")
    .replace(/\s+/g, " ");
  if (!normalized) return true;
  if (WHISPER_HALLUCINATION_PATTERNS.has(normalized)) return true;

  // Single very-short utterance that's a known filler — drop it. Longer
  // phrases containing real speech are kept as-is.
  const words = normalized.split(" ");
  if (words.length <= 4 && WHISPER_HALLUCINATION_PATTERNS.has(words.join(" "))) {
    return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = getApiKeyFromRequest(req);

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error:
            "Request must be multipart/form-data. " +
            "In Postman: set Body → form-data, add an 'audio' File key, " +
            "and do NOT manually set Content-Type (let Postman add the boundary automatically).",
        },
        { status: 415 },
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        {
          error:
            "Failed to parse multipart body. Make sure you are sending " +
            "a valid form-data request with an 'audio' file field.",
        },
        { status: 400 },
      );
    }

    const audio = form.get("audio");

    if (!(audio instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing 'audio' blob in form data" },
        { status: 400 },
      );
    }

    if (audio.size === 0) {
      return NextResponse.json(
        { error: "Audio blob is empty" },
        { status: 400 },
      );
    }

    const groq = createGroqClient(apiKey);

    const file = new File([audio], "chunk.webm", {
      type: audio.type || "audio/webm",
    });

    const resp = await groq.audio.transcriptions.create({
      file,
      model: GROQ_WHISPER_MODEL,
      response_format: "verbose_json",
      temperature: 0,
      // English-only hint dramatically reduces language-detection confusion
      // on short clips that include noise or silence.
      language: "en",
      // A short, domain-specific prompt nudges Whisper toward meeting-style
      // content and away from its YouTube-captions priors.
      prompt:
        "The following is a transcript of a professional meeting conversation. The speakers are discussing business, technology, or strategy topics.",
    });

    const rawText = (resp.text ?? "").trim();
    const duration =
      typeof (resp as unknown as { duration?: number }).duration === "number"
        ? (resp as unknown as { duration: number }).duration
        : null;

    if (rawText && isLikelyHallucination(rawText)) {
      console.debug("[/api/transcribe] dropped hallucination:", rawText);
      return NextResponse.json({ text: "", duration, dropped: "hallucination" });
    }

    return NextResponse.json({ text: rawText, duration });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Transcription failed";
    console.error("[/api/transcribe]", msg);
    const status = msg.toLowerCase().includes("api key") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
