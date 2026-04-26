# TwinMind — Live meeting copilot

## What this is

A **three-column** live copilot: **transcript** (mic → chunked Whisper), **live suggestions** (three cards per refresh, tuned to inferred meeting type), and **streaming chat** (markdown answers, including “expand” from a suggestion). This layout is the product-facing version of a narrower prototype: everything stays readable while audio is in progress.

## Tech stack

| Layer | Choice | Why |
| ----- | ------ | --- |
| App | **Next.js** (App Router) + **TypeScript** | API routes as a thin proxy, one deployable surface, typed client + server. |
| UI | **Tailwind** + small local components | Fast iteration, consistent spacing/typography without a heavy kit. |
| Speech-to-text | **Groq `whisper-large-v3`** | Low-latency transcription; chunks aligned to the configurable refresh window (~30s default). |
| Reasoning | **Groq `openai/gpt-oss-120b`** | One strong model for suggestions, rolling transcript summary, and chat to keep behavior and tuning coherent. |
| Key handling | **Browser `sessionStorage` + `x-groq-api-key`** | No `GROQ_API_KEY` in server env for this assignment; the user’s key never lands in exported JSON. |

## Functional behavior

- **Auto-refresh suggestions** on an interval while there is transcript + API key; skips silent regen when the transcript word count has not grown enough since the last batch (manual refresh bypasses that).
- **Manual “Refresh transcript & suggestions”** — **not** “re-fetch suggestions only”: if recording, it **ends the current mic chunk immediately** (`flushChunk`), **waits for in-flight Whisper** to finish, then **forces** a new suggestion batch. If not recording, there is no new audio to flush; it still refreshes suggestions from the transcript already on screen.
- **Chat** streams tokens; clicking a suggestion seeds an expand prompt.
- **Export / import** session JSON (transcript, batches, chat, settings — **no** API key).
- **Local draft** autosave to `localStorage` with resume/discard on reload.

## Prompt & context strategy

Suggestions receive **layered context** built in `lib/context.ts`:

1. **Structured meeting context** — inferred `meeting_type`, clock duration, coarse phase (opening / deep_dive / closing) from heuristics + model output.
2. **Rolling summary** — model-compressed older transcript so long meetings don’t blow the window.
3. **Recent verbatim transcript** — last *N* minutes (`suggestionContextWindow` in settings).
4. **`last_statement`** — the newest chunk; weighted as the primary signal in `lib/prompts.ts`.

The default suggestion system prompt enforces **type diversity** (answer / fact_check / question_to_ask / talking_point), **preview-first** copy (no meta “you should consider”), meeting-type playbooks, and **anti-repeat** vs the prior batch via `previousSuggestionPreviews` from `useSuggestions`.

Whisper gets a short domain **prompt** on transcribe; obvious junk / prompt echo on near-silent chunks is filtered server-side.

## Deployment

- **Live URL:** https://twin-mind-assignment-fawn.vercel.app/

## Setup (local)

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:3000`, open **Settings**, paste a **Groq** key, then start the mic (or load a fixture / import JSON if enabled).

**Node.js** 20+ recommended.

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build & serve |
| `npm test` | Vitest (`lib/**/*.test.ts`) |
| `npm run lint` | ESLint |
