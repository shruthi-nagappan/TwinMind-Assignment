"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppSettings } from "@/lib/types";
import {
  DEFAULT_CHAT_SYSTEM_PROMPT,
  DEFAULT_DETAILED_ANSWER_PROMPT,
  DEFAULT_ROLLING_SUMMARY_PROMPT,
  DEFAULT_SETTINGS,
  DEFAULT_SUGGESTION_PROMPT,
} from "@/lib/prompts";

type Tab = "api" | "behavior" | "prompts";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

export default function SettingsModal({
  open,
  onClose,
  apiKey,
  onApiKeyChange,
  settings,
  onSettingsChange,
}: SettingsModalProps) {
  const [localKey, setLocalKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [tab, setTab] = useState<Tab>("api");

  useEffect(() => {
    setLocalKey(apiKey);
  }, [apiKey, open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const maskedKey = useMemo(
    () =>
      apiKey && apiKey.length > 8
        ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
        : "",
    [apiKey],
  );

  if (!open) return null;

  const handleResetAll = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Reset all behavior and prompt settings to defaults? (Your API key is kept.)",
      )
    ) {
      return;
    }
    onSettingsChange(DEFAULT_SETTINGS);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[min(82vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Settings</h2>
            <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Session-only
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetAll}
              className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] transition hover:border-rose-500/40 hover:text-rose-300"
              title="Reset behavior + prompts (keeps API key)"
            >
              Reset all
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-[var(--text-muted)] transition hover:bg-[var(--bg-panel-soft)] hover:text-[var(--text-primary)]"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-[var(--border-subtle)] bg-[var(--bg-panel-soft)]/40 p-2">
            <TabButton
              active={tab === "api"}
              onClick={() => setTab("api")}
              label="API key"
              hint={apiKey ? "Set" : "Missing"}
              hintTone={apiKey ? "ok" : "warn"}
            />
            <TabButton
              active={tab === "behavior"}
              onClick={() => setTab("behavior")}
              label="Behavior"
              hint="Context · temps"
            />
            <TabButton
              active={tab === "prompts"}
              onClick={() => setTab("prompts")}
              label="Prompts"
              hint="4 editable"
            />
          </nav>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {tab === "api" && (
              <section className="space-y-3">
                <SectionHeader
                  title="Groq API key"
                  subtitle="Stored in sessionStorage on this device only. Never sent anywhere except Groq."
                />
                <div className="flex items-center gap-2">
                  <input
                    type={showKey ? "text" : "password"}
                    value={localKey}
                    onChange={(e) => setLocalKey(e.target.value)}
                    placeholder="gsk_…"
                    className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent-teal)]"
                  />
                  <button
                    onClick={() => setShowKey((v) => !v)}
                    className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    {showKey ? "Hide" : "Show"}
                  </button>
                  <button
                    onClick={() => onApiKeyChange(localKey.trim())}
                    className="rounded-md bg-[var(--accent-teal-dim)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[var(--accent-teal)]"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {apiKey
                    ? `Current key: ${maskedKey}`
                    : "Paste your Groq API key to enable transcription, suggestions, and chat."}
                </p>

                {apiKey && (
                  <button
                    onClick={() => {
                      if (
                        typeof window !== "undefined" &&
                        !window.confirm("Remove the API key from this session?")
                      ) {
                        return;
                      }
                      onApiKeyChange("");
                      setLocalKey("");
                    }}
                    className="mt-1 rounded-md border border-rose-500/30 px-3 py-1.5 text-[11px] font-medium text-rose-300 transition hover:border-rose-500/60 hover:bg-rose-500/10"
                  >
                    Clear API key
                  </button>
                )}

                <div className="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2.5 text-[12px] text-[var(--text-muted)]">
                  <p className="mb-1 font-semibold text-[var(--text-secondary)]">
                    Get a key
                  </p>
                  <p>
                    Sign in at{" "}
                    <a
                      href="https://console.groq.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent-teal)] underline underline-offset-2"
                    >
                      console.groq.com
                    </a>
                    , create an API key, and paste it here. The free tier is
                    enough to run full sessions.
                  </p>
                </div>
              </section>
            )}

            {tab === "behavior" && (
              <section className="space-y-5">
                <SectionHeader
                  title="Model behavior"
                  subtitle="Tuning knobs for how suggestions are generated and refreshed. Changes take effect on the next batch."
                />

                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Refresh interval (seconds)"
                    hint="How often suggestions auto-regenerate. Also the audio chunk size."
                    value={settings.refreshIntervalSeconds}
                    min={10}
                    max={120}
                    step={5}
                    onChange={(n) =>
                      onSettingsChange({
                        ...settings,
                        refreshIntervalSeconds: n,
                      })
                    }
                  />
                  <NumberField
                    label="Skip-regen threshold (words)"
                    hint="If transcript grows by less than this since last batch, auto-refresh skips."
                    value={settings.skipRegenerationThreshold}
                    min={0}
                    max={200}
                    step={5}
                    onChange={(n) =>
                      onSettingsChange({
                        ...settings,
                        skipRegenerationThreshold: n,
                      })
                    }
                  />
                  <NumberField
                    label="Suggestion context (words)"
                    hint="Recent-transcript window sent to the suggestion model."
                    value={settings.suggestionContextWindow}
                    min={200}
                    max={4000}
                    step={100}
                    onChange={(n) =>
                      onSettingsChange({
                        ...settings,
                        suggestionContextWindow: n,
                      })
                    }
                  />
                  <NumberField
                    label="Expanded answer context (words)"
                    hint="Transcript tail included in chat + detailed answers."
                    value={settings.expandedContextWindow}
                    min={500}
                    max={10000}
                    step={250}
                    onChange={(n) =>
                      onSettingsChange({
                        ...settings,
                        expandedContextWindow: n,
                      })
                    }
                  />
                  <NumberField
                    label="Suggestion temperature"
                    hint="Higher = more varied phrasing. 0.7 is a good default."
                    value={settings.suggestionTemperature}
                    min={0}
                    max={1.5}
                    step={0.1}
                    onChange={(n) =>
                      onSettingsChange({
                        ...settings,
                        suggestionTemperature: n,
                      })
                    }
                  />
                  <NumberField
                    label="Chat temperature"
                    hint="Lower = more grounded, factual answers. 0.4 by default."
                    value={settings.chatTemperature}
                    min={0}
                    max={1.5}
                    step={0.1}
                    onChange={(n) =>
                      onSettingsChange({ ...settings, chatTemperature: n })
                    }
                  />
                </div>
              </section>
            )}

            {tab === "prompts" && (
              <section className="space-y-4">
                <SectionHeader
                  title="Prompts"
                  subtitle="Edit any of the four core prompts. These are the system prompts that drive the suggestion model, the on-click detailed answer, free-form chat, and the rolling summary. Reset each one individually if you break it."
                />

                <PromptEditor
                  label="Live suggestions"
                  hint="Drives the 3-card suggestion generation. Must return strict JSON with a meeting_type + 3 suggestions."
                  value={settings.suggestionPrompt}
                  defaultValue={DEFAULT_SUGGESTION_PROMPT}
                  onChange={(s) =>
                    onSettingsChange({ ...settings, suggestionPrompt: s })
                  }
                />
                <PromptEditor
                  label="Detailed on-click answer"
                  hint="Used when the user clicks a suggestion to expand it. Output is streamed markdown."
                  value={settings.detailedAnswerPrompt}
                  defaultValue={DEFAULT_DETAILED_ANSWER_PROMPT}
                  onChange={(s) =>
                    onSettingsChange({ ...settings, detailedAnswerPrompt: s })
                  }
                />
                <PromptEditor
                  label="Free-form chat"
                  hint="Used when the user types a question into the chat column."
                  value={settings.chatSystemPrompt}
                  defaultValue={DEFAULT_CHAT_SYSTEM_PROMPT}
                  onChange={(s) =>
                    onSettingsChange({ ...settings, chatSystemPrompt: s })
                  }
                />
                <PromptEditor
                  label="Rolling summary"
                  hint="Compresses older transcript when sessions get long. Output is injected as meeting_summary into the suggestion context."
                  value={settings.rollingSummaryPrompt}
                  defaultValue={DEFAULT_ROLLING_SUMMARY_PROMPT}
                  onChange={(s) =>
                    onSettingsChange({ ...settings, rollingSummaryPrompt: s })
                  }
                />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  hint,
  hintTone = "muted",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  hintTone?: "muted" | "ok" | "warn";
}) {
  const hintClass =
    hintTone === "ok"
      ? "text-emerald-300"
      : hintTone === "warn"
        ? "text-amber-300"
        : "text-[var(--text-muted)]";
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col gap-0.5 rounded-md px-3 py-2 text-left transition ${
        active
          ? "bg-[var(--bg-panel-soft)] text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-panel-soft)]/60 hover:text-[var(--text-primary)]"
      }`}
    >
      <span className="text-[13px] font-medium">{label}</span>
      {hint && (
        <span className={`text-[10.5px] uppercase tracking-[0.12em] ${hintClass}`}>
          {hint}
        </span>
      )}
    </button>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
        {subtitle}
      </p>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10.5px] font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)]">
        {label}
      </label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-teal)]"
      />
      {hint && (
        <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}

function PromptEditor({
  label,
  hint,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  defaultValue: string;
  onChange: (s: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDefault = value.trim() === defaultValue.trim();
  const charCount = value.length;

  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)]/50">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">
              {label}
            </span>
            {!isDefault && (
              <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                Modified
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">
            {hint}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] text-[var(--text-muted)]">
            {charCount} chars
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-[var(--text-muted)] transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[var(--border-subtle)] p-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={12}
            spellCheck={false}
            className="w-full resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--text-primary)] outline-none focus:border-[var(--accent-teal)]"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-muted)]">
              {isDefault ? "Matches default" : "Edited from default"}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    void navigator.clipboard.writeText(value);
                  }
                }}
                className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Copy
              </button>
              <button
                onClick={() => onChange(defaultValue)}
                disabled={isDefault}
                className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent-teal-dim)] hover:text-[var(--accent-teal)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border-subtle)] disabled:hover:text-[var(--text-secondary)]"
              >
                Reset to default
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
