// ─────────────────────────────────────────────
// VoicePilot — Intent Router
// Classifies user speech into structured actions
// ─────────────────────────────────────────────

import type { Intent, IntentType } from "../utils/constants";

/**
 * Local intent detection using keyword matching.
 * Falls back to AI classification for ambiguous inputs.
 */
export function detectLocalIntent(text: string): Intent | null {
  const lower = text.toLowerCase().trim();

  // Scroll commands
  if (matchesAny(lower, ["scroll down", "go down", "page down", "move down"])) {
    return { type: "scroll", target: "down", rawText: text };
  }
  if (matchesAny(lower, ["scroll up", "go up", "page up", "move up"])) {
    return { type: "scroll", target: "up", rawText: text };
  }
  if (matchesAny(lower, ["scroll to top", "go to top", "back to top", "top of page"])) {
    return { type: "scroll", target: "top", rawText: text };
  }
  if (matchesAny(lower, ["scroll to bottom", "go to bottom", "bottom of page"])) {
    return { type: "scroll", target: "bottom", rawText: text };
  }

  // Navigation - go back / forward
  if (matchesAny(lower, ["go back", "back", "previous page", "go to previous"])) {
    return { type: "go_back", rawText: text };
  }
  if (matchesAny(lower, ["go forward", "forward", "next page"])) {
    return { type: "go_forward", rawText: text };
  }

  // Go home / homepage
  if (
    matchesAny(lower, [
      "go home", "go to home", "homepage", "home page",
      "main page", "go to homepage", "go to the homepage",
      "take me home", "go to main page", "back to home",
      "open home", "open homepage",
    ])
  ) {
    return { type: "go_home", rawText: text };
  }

  // Summarize page
  if (
    matchesAny(lower, [
      "summarize",
      "summary",
      "what is this",
      "what's this",
      "tell me about this",
      "what does this",
      "what is this website",
      "what is this page",
      "describe this",
    ])
  ) {
    return { type: "summarize_page", rawText: text };
  }

  // Describe layout / where am I
  if (
    matchesAny(lower, [
      "where am i",
      "describe the layout",
      "what's on this page",
      "describe this page",
      "page layout",
    ])
  ) {
    return { type: "describe_layout", rawText: text };
  }

  // Read page
  if (
    matchesAny(lower, [
      "read this page",
      "read to me",
      "read important",
      "read the content",
      "read aloud",
    ])
  ) {
    return { type: "read_page", rawText: text };
  }

  // Navigate to section (pattern: "find X", "go to X", "open X", "show me X")
  const navPatterns = [
    /^(?:find|go to|open|show me|navigate to|take me to|show)\s+(.+)/i,
    /^(?:where is|where's)\s+(?:the\s+)?(.+)/i,
  ];
  for (const pattern of navPatterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      return {
        type: "navigate_section",
        target: match[1].replace(/^the\s+/, "").trim(),
        rawText: text,
      };
    }
  }

  // Click element (pattern: "click X", "press X", "tap X")
  const clickPatterns = [
    /^(?:click|press|tap|hit|select)\s+(?:the\s+|on\s+)?(.+)/i,
  ];
  for (const pattern of clickPatterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      return {
        type: "click_element",
        target: match[1].trim(),
        rawText: text,
      };
    }
  }

  // Explain content
  if (
    matchesAny(lower, [
      "explain",
      "what does this mean",
      "help me understand",
      "break down",
      "elaborate",
    ])
  ) {
    return { type: "explain_content", rawText: text };
  }

  // Play media
  if (matchesAny(lower, ["play music", "play audio", "play video", "play the music", "play the video", "play the audio", "play song", "resume music", "resume audio", "resume video"])) {
    return { type: "play_media", rawText: text };
  }
  const playPatterns = [
    /^play\s+(.+)/i,
    /^(?:start|resume)\s+(?:playing\s+)?(.+)/i,
  ];
  for (const pattern of playPatterns) {
    const match = lower.match(pattern);
    if (match?.[1] && !match[1].includes("section") && !match[1].includes("page")) {
      return { type: "play_media", target: match[1].trim(), rawText: text };
    }
  }

  // Search
  const searchPatterns = [
    /^search\s+(?:for\s+)?(.+)/i,
    /^look\s+(?:up|for)\s+(.+)/i,
    /^find\s+(?:me\s+)?(.+?)(?:\s+on\s+this\s+page)?$/i,
    /^type\s+(.+?)\s+in\s+(?:the\s+)?search/i,
  ];
  for (const pattern of searchPatterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      return { type: "search", target: match[1].trim(), rawText: text };
    }
  }

  // No local match — let AI handle it
  return null;
}

/**
 * Build the AI prompt for intent classification
 */
export function buildIntentPrompt(userText: string): string {
  return `You are an intent classifier for a voice-controlled browser extension.
Classify the user's speech into one of these intents:
- summarize_page: User wants to understand the page
- navigate_section: User wants to go to a specific section (extract target)
- click_element: User wants to click something (extract target)
- scroll: User wants to scroll (extract direction: up/down/top/bottom)
- explain_content: User wants deeper explanation of content
- read_page: User wants content read aloud
- describe_layout: User wants to know page structure
- go_back: User wants to go to previous page
- go_forward: User wants to go forward
- go_home: User wants to go to the homepage
- play_media: User wants to play audio/video/music (extract target if specific)
- search: User wants to search for something (extract the search query as target)
- general_question: User is asking a general question about the page content

User said: "${userText}"

Respond ONLY with valid JSON:
{"type": "<intent>", "target": "<target if applicable, otherwise null>"}`;
}

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some(
    (p) => text.includes(p) || text.startsWith(p)
  );
}
