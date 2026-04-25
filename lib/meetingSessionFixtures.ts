import type { MeetingType, TranscriptChunk } from "@/lib/types";

/**
 * Day 8 — four canned “test sessions” for prompt QA. Load them from Mic &
 * Transcript (“QA fixture”), paste chunks manually, or POST these `transcript`
 * payloads to `/api/suggestions`. Each fixture is tuned to evoke a specific
 * meeting_type signal for the model.
 */
export interface MeetingSessionFixture {
  id: string;
  label: string;
  /** Hint for humans — the model still chooses meeting_type from content. */
  expectedMeetingType: MeetingType;
  chunks: TranscriptChunk[];
}

function chunk(
  id: string,
  text: string,
  timestamp: string,
  wordCount: number,
): TranscriptChunk {
  return { id, text, timestamp, wordCount };
}

/** ~Technical interview: coding tradeoff + salary expectation question */
export const FIXTURE_INTERVIEW: MeetingSessionFixture = {
  id: "interview_backend",
  label: "Backend interview — scaling + comp question",
  expectedMeetingType: "interview",
  chunks: [
    chunk(
      "fx-i-1",
      "Walk me through how you'd design rate limiting for a public API that spikes during product launches. Assume Redis is available and you care about fairness across tenants.",
      "10:00:01 AM",
      32,
    ),
    chunk(
      "fx-i-2",
      "Got it. Last thing — we're targeting one hundred twenty thousand base for this level in Austin. Does that align with what you're looking for, or were you expecting something higher?",
      "10:00:45 AM",
      28,
    ),
  ],
};

/** ~Sales: ROI objection + competitor name-drop */
export const FIXTURE_SALES: MeetingSessionFixture = {
  id: "sales_enterprise",
  label: "Enterprise sales — ROI objection",
  expectedMeetingType: "sales_call",
  chunks: [
    chunk(
      "fx-s-1",
      "We like the workflow, but finance wants proof the rollout pays back in nine months. Right now they model an eighteen month payback and that's a non-starter for Q3 budget.",
      "02:14:10 PM",
      35,
    ),
    chunk(
      "fx-s-2",
      "Also be honest with us — if we go with you instead of AcmeCloud, what do we lose on day one integrations? Their Salesforce connector is already live in our sandbox.",
      "02:14:55 PM",
      32,
    ),
  ],
};

/** ~Brainstorm: divergent ideas + “yes and” moment */
export const FIXTURE_BRAINSTORM: MeetingSessionFixture = {
  id: "brainstorm_launch",
  label: "Product brainstorm — launch stunts",
  expectedMeetingType: "brainstorm",
  chunks: [
    chunk(
      "fx-b-1",
      "Okay wild ideas only for the summer drop — what if we shipped empty tins as collectibles and the NFT was the recipe card inside? Too gimmicky or actually memorable?",
      "09:05:12 AM",
      33,
    ),
    chunk(
      "fx-b-2",
      "Love that. Building on the tin idea — we could partner with three micro bakeries and each tin unlocks a different real-world pickup slot. Makes scarcity feel fun instead of cruel.",
      "09:05:48 AM",
      36,
    ),
  ],
};

/** ~Technical sync: ambiguous requirement + deadline pressure */
export const FIXTURE_TECH_SYNC: MeetingSessionFixture = {
  id: "technical_sync_api",
  label: "Engineering sync — ambiguous API cutover",
  expectedMeetingType: "technical_sync",
  chunks: [
    chunk(
      "fx-t-1",
      "The mobile team thinks v2 responses are backward compatible but web still parses the old pagination envelope. We need one truth on whether offset-based paging ships Friday or we slip the release.",
      "04:22:01 PM",
      34,
    ),
    chunk(
      "fx-t-2",
      "If we slip, support wants a feature flag that routes ten percent of reads to v2 first. SRE says that doubles error budget burn — can someone sanity check that claim with last week's incident data?",
      "04:22:40 PM",
      33,
    ),
  ],
};

export const MEETING_SESSION_FIXTURES: MeetingSessionFixture[] = [
  FIXTURE_INTERVIEW,
  FIXTURE_SALES,
  FIXTURE_BRAINSTORM,
  FIXTURE_TECH_SYNC,
];

export function getFixtureById(id: string): MeetingSessionFixture | undefined {
  return MEETING_SESSION_FIXTURES.find((f) => f.id === id);
}
