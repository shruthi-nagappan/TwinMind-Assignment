"use client";

interface AppHeaderProps {
  onOpenSettings: () => void;
  apiKeySet: boolean;
}

export default function AppHeader({ onOpenSettings, apiKeySet }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] px-6 py-3.5">
      <div className="flex items-center gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
          TwinMind
          <span className="mx-2 text-[var(--text-muted)]">—</span>
          <span className="text-[var(--text-secondary)] font-normal">
            Live Suggestions Web App
          </span>
        </h1>
      </div>
      <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
        <span className="hidden md:inline">
          3-column layout
          <span className="mx-2 text-[var(--text-muted)]">·</span>
          Transcript
          <span className="mx-2 text-[var(--text-muted)]">·</span>
          Live Suggestions
          <span className="mx-2 text-[var(--text-muted)]">·</span>
          Chat
        </span>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
          Settings
          {!apiKeySet && (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
          )}
        </button>
      </div>
    </header>
  );
}
