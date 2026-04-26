# TwinMind — Live meeting copilot (assignment)

Real-time **transcription** (Groq Whisper), **three live suggestions** per refresh tuned to meeting type, and a **streaming chat** column for detailed answers. Next.js App Router, client-side Groq API key (stored in `sessionStorage`), and API routes that proxy requests with your key.

## Prerequisites

- **Node.js** 20+ recommended  
- A **[Groq](https://console.groq.com/) API key** with access to the models configured in `lib/prompts.ts` (Whisper + chat/suggestion models)

## Quick start

```bash
cd app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Paste your Groq API key under **Settings**, then use the mic to record (~30s chunks transcribed to the left column).

## Scripts

| Command        | Purpose                          |
| -------------- | -------------------------------- |
| `npm run dev`  | Local development server         |
| `npm run build` / `npm start` | Production build & serve |
| `npm test`     | Vitest (`lib/**/*.test.ts`)      |
| `npm run lint` | ESLint                           |

## Environment variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| *(none)* | — | The app does **not** read `GROQ_API_KEY` from the server. You supply the key in the UI; it is sent as `x-groq-api-key` on API calls. |
| `NEXT_PUBLIC_SHOW_QA_FIXTURES` | No | Set to `true` to show the **QA fixture** dropdown (canned transcripts for testing suggestions without the mic). Hidden by default. |

Create `app/.env.local` for local flags, or set variables in your host (e.g. Vercel) for preview/production.

## Using the app

1. **Settings** — Groq API key and editable prompts (suggestions, rolling summary, chat, temperatures, refresh interval).  
2. **Mic & transcript** — Start/stop recording; each chunk is transcribed independently.  
3. **Live suggestions** — Auto-refresh while there is transcript and a key; use **Reload suggestions** to force a batch.  
4. **Chat** — Ask about the meeting or click a suggestion to expand into a streamed markdown answer.

### Session workflow

- **New meeting** — Clears transcript, suggestion history, chat, meeting clock, and the **local draft** (see below). Stop recording first if needed.  
- **Export session (JSON)** — Download transcript, batches, chat, and current settings (no API key).  
- **Import session (JSON)** — Restore from a prior export file.  
- **Local draft (autosave)** — While you have session content, the app debounces writes to `localStorage`. After a refresh, choose **Resume draft** or **Discard** from the banner.

Whisper uses a short meeting-style **prompt**; obvious junk (including prompt echo on silent chunks) is filtered in `app/api/transcribe/route.ts`.

## Deployment (e.g. Vercel)

Connect the Git repo whose **root is this `app/` folder** (or set **Root Directory** to `app` if the repo root is higher). Build command: `npm run build`, output: Next.js default. Add `NEXT_PUBLIC_SHOW_QA_FIXTURES` only if you want QA fixtures in that environment.

## Project layout

```
app/                 # Next.js routes (page, API)
components/          # UI (header, mic/transcript, settings, suggestions, chat)
lib/                 # Hooks, prompts, types, Groq context, export/import, draft, fixtures
```

## License

Private assignment project (`private: true` in `package.json`).
