"use client";

import { useEffect, useState } from "react";
import type { AppSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/prompts";

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

  useEffect(() => {
    setLocalKey(apiKey);
  }, [apiKey, open]);

  if (!open) return null;

  const maskedKey =
    apiKey && apiKey.length > 8
      ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
      : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
          <h2 className="text-sm font-semibold">Settings</h2>
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Groq API Key
            </label>
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
                onClick={() => {
                  onApiKeyChange(localKey.trim());
                }}
                className="rounded-md bg-[var(--accent-teal-dim)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[var(--accent-teal)]"
              >
                Save
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {apiKey
                ? `Current key: ${maskedKey}. Stored in session only.`
                : "Paste your own Groq API key. It is stored in sessionStorage on this device only — never sent anywhere except Groq."}
            </p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Prompts &amp; context windows
              </label>
              <button
                onClick={() => onSettingsChange(DEFAULT_SETTINGS)}
                className="text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-primary)]"
              >
                Reset all to defaults
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Prompts and tuning parameters are editable in later iterations. Day-1
              placeholder — full editing UI ships on Day 6.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Field
                label="Suggestion context (words)"
                value={settings.suggestionContextWindow}
                onChange={(n) =>
                  onSettingsChange({ ...settings, suggestionContextWindow: n })
                }
              />
              <Field
                label="Expanded answer context (words)"
                value={settings.expandedContextWindow}
                onChange={(n) =>
                  onSettingsChange({ ...settings, expandedContextWindow: n })
                }
              />
              <Field
                label="Suggestion temperature"
                value={settings.suggestionTemperature}
                step={0.1}
                onChange={(n) =>
                  onSettingsChange({ ...settings, suggestionTemperature: n })
                }
              />
              <Field
                label="Chat temperature"
                value={settings.chatTemperature}
                step={0.1}
                onChange={(n) =>
                  onSettingsChange({ ...settings, chatTemperature: n })
                }
              />
              <Field
                label="Skip regen threshold (words)"
                value={settings.skipRegenerationThreshold}
                onChange={(n) =>
                  onSettingsChange({ ...settings, skipRegenerationThreshold: n })
                }
              />
              <Field
                label="Refresh interval (seconds)"
                value={settings.refreshIntervalSeconds}
                onChange={(n) =>
                  onSettingsChange({ ...settings, refreshIntervalSeconds: n })
                }
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-teal)]"
      />
    </div>
  );
}
