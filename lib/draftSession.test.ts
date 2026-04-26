import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_SESSION_STORAGE_KEY,
  clearDraftSession,
  readDraftSessionJson,
  writeDraftSessionJson,
} from "./draftSession";

describe("draftSession (Day 10)", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    vi.stubGlobal(
      "localStorage",
      {
        getItem: (k: string) => (k in store ? store[k]! : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
        get length() {
          return Object.keys(store).length;
        },
        key: (i: number) => Object.keys(store)[i] ?? null,
      } as Storage,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(store)) delete store[k];
  });

  it("round-trips JSON via localStorage", () => {
    writeDraftSessionJson('{"hello":1}');
    expect(readDraftSessionJson()).toBe('{"hello":1}');
    expect(store[DRAFT_SESSION_STORAGE_KEY]).toBe('{"hello":1}');
  });

  it("clearDraftSession removes the key", () => {
    writeDraftSessionJson("{}");
    clearDraftSession();
    expect(readDraftSessionJson()).toBeNull();
  });
});
