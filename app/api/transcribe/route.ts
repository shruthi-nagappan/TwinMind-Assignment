import { NextRequest, NextResponse } from "next/server";
import { createGroqClient, getApiKeyFromRequest } from "@/lib/groq";
import { GROQ_WHISPER_MODEL } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Whisper hallucinates YouTube-caption boilerplate when fed silent audio.
 * Client-side silence detection already drops silent chunks, so we only
 * filter the *unambiguous* hallucinations here — phrases that would never
 * be the entire content of a meeting chunk. We deliberately do NOT filter
 * normal short utterances like "thank you", "okay", "bye", "hmm" since
 * those are perfectly valid in real conversation.
 */
const HALLUCINATION_EXACT_MATCHES = new Set<string>([
  "you",
  "you you",
  "you you you",
  ".",
  "...",
]);

const HALLUCINATION_SUBSTRINGS = [
  "thanks for watching",
  "thank you for watching",
  "please like and subscribe",
  "like and subscribe",
  "don't forget to subscribe",
  "subscribe to the channel",
  "see you in the next video",
  "see you next time",
];

function isLikelyHallucination(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:\u2026]+$/g, "")
    .replace(/\s+/g, " ");
  if (!normalized) return true;
  if (HALLUCINATION_EXACT_MATCHES.has(normalized)) return true;
  for (const needle of HALLUCINATION_SUBSTRINGS) {
    if (normalized.includes(needle)) return true;
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
