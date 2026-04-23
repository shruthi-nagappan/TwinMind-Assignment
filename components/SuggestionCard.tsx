"use client";

import type { Suggestion } from "@/lib/types";
import { SUGGESTION_TYPE_META } from "@/lib/prompts";

interface SuggestionCardProps {
  suggestion: Suggestion;
  onClick?: (s: Suggestion) => void;
  faded?: boolean;
}

export default function SuggestionCard({
  suggestion,
  onClick,
  faded,
}: SuggestionCardProps) {
  const meta = SUGGESTION_TYPE_META[suggestion.type];
  return (
    <button
      onClick={() => onClick?.(suggestion)}
      disabled={!onClick}
      className={`group relative w-full overflow-hidden rounded-md border border-[var(--border-subtle)] border-l-4 ${meta.border} bg-[var(--bg-card)] text-left transition hover:border-[var(--border-strong)] disabled:cursor-default ${faded ? "opacity-50" : ""}`}
    >
      <div className="px-4 py-3.5">
        <span
          className={`mb-2 inline-block rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${meta.badgeBg} ${meta.badgeText}`}
        >
          {meta.label}
        </span>
        <p className="text-[15px] leading-relaxed text-[var(--text-primary)]">
          {suggestion.preview}
        </p>
      </div>
    </button>
  );
}
