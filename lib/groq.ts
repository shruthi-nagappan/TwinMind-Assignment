import Groq from "groq-sdk";

export function createGroqClient(apiKey: string): Groq {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Missing Groq API key");
  }
  return new Groq({ apiKey });
}

export function getApiKeyFromRequest(req: Request): string {
  const key = req.headers.get("x-groq-api-key");
  if (!key) {
    throw new Error("Missing x-groq-api-key header");
  }
  return key;
}
