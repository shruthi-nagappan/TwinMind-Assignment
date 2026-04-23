import { NextRequest, NextResponse } from "next/server";
import { createGroqClient, getApiKeyFromRequest } from "@/lib/groq";
import { GROQ_WHISPER_MODEL } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    });

    const text = (resp.text ?? "").trim();
    const duration =
      typeof (resp as unknown as { duration?: number }).duration === "number"
        ? (resp as unknown as { duration: number }).duration
        : null;

    return NextResponse.json({ text, duration });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Transcription failed";
    console.error("[/api/transcribe]", msg);
    const status = msg.toLowerCase().includes("api key") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
