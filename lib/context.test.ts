import { describe, expect, it } from "vitest";
import { buildSuggestionContext, renderContextForPrompt } from "./context";
import { MEETING_SESSION_FIXTURES } from "./meetingSessionFixtures";

describe("renderContextForPrompt", () => {
  it("includes PREVIOUS_SUGGESTION_PREVIEWS when opts provide lines", async () => {
    const fixture = MEETING_SESSION_FIXTURES[0]!;
    const ctx = await buildSuggestionContext({
      chunks: fixture.chunks,
      windowWords: 800,
      meetingStartTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    const rendered = renderContextForPrompt(ctx, {
      previousSuggestionPreviews: [
        "fact_check: Verify the payback window.",
        "question_to_ask: What adoption curve did finance use?",
      ],
    });
    expect(rendered).toContain("PREVIOUS_SUGGESTION_PREVIEWS");
    expect(rendered).toContain("fact_check: Verify the payback window.");
    expect(rendered).toContain("LAST_STATEMENT");
  });

  it("omits previous block when not passed", async () => {
    const fixture = MEETING_SESSION_FIXTURES[0]!;
    const ctx = await buildSuggestionContext({
      chunks: fixture.chunks,
      windowWords: 800,
      meetingStartTime: null,
    });
    const rendered = renderContextForPrompt(ctx);
    expect(rendered).not.toContain("PREVIOUS_SUGGESTION_PREVIEWS");
  });
});
