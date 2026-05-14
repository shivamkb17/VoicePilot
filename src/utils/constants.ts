// ─────────────────────────────────────────────
// VoicePilot — Shared Constants
// ─────────────────────────────────────────────

/** Message types for Chrome runtime messaging */
export const MSG = {
  // Voice session
  START_LISTENING: "voicepilot:start_listening",
  STOP_LISTENING: "voicepilot:stop_listening",
  SPEECH_RESULT: "voicepilot:speech_result",
  /** Content script → SW: start offscreen mic capture for sender tab */
  MIC_START: "voicepilot:mic_start",
  /** Content script → SW: stop offscreen mic capture for sender tab */
  MIC_STOP: "voicepilot:mic_stop",
  /** SW → content script → overlay: AI pipeline result for TTS + transcript UI */
  SPEECH_OUTCOME: "voicepilot:speech_outcome",
  /** SW → overlay: lightweight status / toast (wake word, errors that skip AI) */
  OVERLAY_NOTIFY: "voicepilot:overlay_notify",
  /** Offscreen recorder → SW */
  RECORDER_EVENT: "voicepilot:recorder_event",
  /** SW → offscreen */
  RECORDER_START: "voicepilot:recorder_start",
  RECORDER_STOP: "voicepilot:recorder_stop",
  /** Overlay → SW after TTS completes; SW forwards resume to offscreen */
  TTS_DONE: "voicepilot:tts_done",
  RECORDER_RESUME: "voicepilot:recorder_resume",
  AI_RESPONSE: "voicepilot:ai_response",

  // Page understanding
  GET_PAGE_CONTEXT: "voicepilot:get_page_context",
  PAGE_CONTEXT_RESULT: "voicepilot:page_context_result",

  // Navigation
  NAVIGATE: "voicepilot:navigate",
  SCROLL: "voicepilot:scroll",
  CLICK_ELEMENT: "voicepilot:click_element",

  // Media control
  PAUSE_MEDIA: "voicepilot:pause_media",
  RESUME_MEDIA: "voicepilot:resume_media",
  PLAY_MEDIA: "voicepilot:play_media",
  LOCK_MEDIA: "voicepilot:lock_media",
  UNLOCK_MEDIA: "voicepilot:unlock_media",

  // Search
  SEARCH: "voicepilot:search",

  // Form interactions
  FILL_FORM: "voicepilot:fill_form",
  SUBMIT_FORM: "voicepilot:submit_form",
  SEND_MESSAGE: "voicepilot:send_message",
  TYPE_TEXT: "voicepilot:type_text",

  // State
  UPDATE_STATE: "voicepilot:update_state",
  GET_STATE: "voicepilot:get_state",

  // Settings
  GET_SETTINGS: "voicepilot:get_settings",
  SAVE_SETTINGS: "voicepilot:save_settings",

  // Mic persistence
  CHECK_MIC_STATE: "voicepilot:check_mic_state",
} as const;

/** Overlay states */
export type OrbState = "idle" | "listening" | "processing" | "speaking" | "error";

/** Storage keys */
export const STORAGE_KEYS = {
  LLM_PROVIDER: "voicepilot_llm_provider",
  OPENAI_KEY: "voicepilot_openai_key",
  ELEVENLABS_KEY: "voicepilot_elevenlabs_key",
  FIRECRAWL_KEY: "voicepilot_firecrawl_key",
  PROXY_URL: "voicepilot_proxy_url",
  VOICE_ID: "voicepilot_voice_id",
  ALWAYS_LISTENING: "voicepilot_always_listening",
  SUBTITLES_ENABLED: "voicepilot_subtitles_enabled",
} as const;

/** Default settings */
export const DEFAULTS = {
  LLM_PROVIDER: "openrouter",
  PROXY_URL: "",
  VOICE_ID: "21m00Tcm4TlvDq8ikWAM", // ElevenLabs "Rachel" voice
  ALWAYS_LISTENING: false,
  SUBTITLES_ENABLED: true,

  // Default API keys for development/testing
  OPENAI_KEY: "",
  ELEVENLABS_KEY: "",
  FIRECRAWL_KEY: "",
} as const;

/** Intent types */
export type IntentType =
  | "summarize_page"
  | "navigate_section"
  | "click_element"
  | "scroll"
  | "explain_content"
  | "read_page"
  | "describe_layout"
  | "general_question"
  | "go_back"
  | "go_forward"
  | "go_home"
  | "play_media"
  | "search"
  | "fill_form"
  | "submit_form"
  | "send_message"
  | "type_text";

export interface Intent {
  type: IntentType;
  target?: string;
  rawText: string;
}

/** Page context for AI */
export interface PageContext {
  url: string;
  title: string;
  metaDescription: string;
  headings: { level: number; text: string }[];
  sections: { heading: string; text: string; id?: string }[];
  buttons: { text: string; id?: string; className?: string }[];
  links: { text: string; href: string }[];
  forms: { id?: string; action?: string; inputs: string[] }[];
  images: number;
  mainContent: string;
}

/** Conversation message */
export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
