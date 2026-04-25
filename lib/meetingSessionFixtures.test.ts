import { describe, expect, it } from "vitest";
import {
  buildSuggestionContext,
  renderContextForPrompt,
} from "@/lib/context";
import { MEETING_SESSION_FIXTURES } from "./meetingSessionFixtures";

describe("Day 8 meeting session fixtures", () => {
  it("exposes four distinct fixtures for prompt QA", () => {
    expect(MEETING_SESSION_FIXTURES).toHaveLength(4);
    const ids = MEETING_SESSION_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(4);
  });

  it.each(MEETING_SESSION_FIXTURES)(
    "$id yields non-empty last_statement and renderable context",
    async (fixture) => {
      const started = new Date(Date.now() - 12 * 60 * 1000).toISOString();
      const ctx = await buildSuggestionContext({
        chunks: fixture.chunks,
        windowWords: 800,
        meetingStartTime: started,
      });
      expect(ctx.last_statement.length).toBeGreaterThan(10);
      expect(ctx.recent_transcript).toContain(
        fixture.chunks[fixture.chunks.length - 1]!.text.slice(0, 24),
      );
      const rendered = renderContextForPrompt(ctx);
      expect(rendered).toContain("LAST_STATEMENT");
      expect(rendered).toContain(ctx.last_statement);
      expect(rendered).toContain("deep_dive");
    },
  );
});
