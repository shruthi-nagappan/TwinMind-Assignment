export type SuggestionType =
  | "answer"
  | "fact_check"
  | "question_to_ask"
  | "talking_point";

export type MeetingPhase = "opening" | "deep_dive" | "closing";

export type MeetingType =
  | "interview"
  | "sales_call"
  | "brainstorm"
  | "technical_sync"
  | "lecture"
  | "one_on_one"
  | "generic";

export interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: string;
  wordCount: number;
}

export interface Suggestion {
  id: string;
  type: SuggestionType;
  preview: string;
  detail_hint: string;
  meeting_phase: MeetingPhase;
}

export interface SuggestionBatch {
  id: string;
  suggestions: Suggestion[];
  timestamp: string;
  transcriptWordCount: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  linkedSuggestion?: {
    type: SuggestionType;
    preview: string;
  };
}

export interface SessionState {
  transcript: TranscriptChunk[];
  suggestionBatches: SuggestionBatch[];
  chatHistory: ChatMessage[];
  meetingType: MeetingType;
  meetingStartTime: string | null;
}

export interface AppSettings {
  suggestionPrompt: string;
  detailedAnswerPrompt: string;
  chatSystemPrompt: string;
  suggestionContextWindow: number;
  expandedContextWindow: number;
  suggestionTemperature: number;
  chatTemperature: number;
  skipRegenerationThreshold: number;
  refreshIntervalSeconds: number;
}

export interface SuggestionContext {
  meeting_context: {
    detected_type: MeetingType | "unknown";
    duration_minutes: number;
    phase: MeetingPhase;
  };
  meeting_summary: string;
  recent_transcript: string;
  last_statement: string;
}
