// ─────────────────────────────────────────────
// VoicePilot — Shared Constants
// ─────────────────────────────────────────────

/** Message types for Chrome runtime messaging */
export const MSG = {
  // Voice session
  START_LISTENING: "voicepilot:start_listening",
  STOP_LISTENING: "voicepilot:stop_listening",
  SPEECH_RESULT: "voicepilot:speech_result",
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
} as const;

/** Overlay states */
export type OrbState = "idle" | "listening" | "processing" | "speaking" | "error";

/** Storage keys */
export const STORAGE_KEYS = {
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
  PROXY_URL: "",
  VOICE_ID: "21m00Tcm4TlvDq8ikWAM", // ElevenLabs "Rachel" voice
  ALWAYS_LISTENING: false,
  SUBTITLES_ENABLED: true,

  // Default API keys for development/testing
  OPENAI_KEY: "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",
  ELEVENLABS_KEY: "sk_5b9b159846ae86a30b6ce38cadea604e9240517f78ffef2d",
  FIRECRAWL_KEY: "fc-5c619b0e50944d8e8cd364494ba39e27",
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
