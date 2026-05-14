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
  // Using exact regex to prevent false positives like "back to agents" or "forward email"
  const backRegex = /^(?:please\s+|can you\s+|could you\s+|just\s+)?(?:go\s+|navigate\s+)?back$/i;
  const previousRegex = /^(?:please\s+|can you\s+|could you\s+|just\s+)?(?:go\s+(?:to\s+)?)?previous(?:\s+page)?$/i;
  if (backRegex.test(lower) || previousRegex.test(lower)) {
    return { type: "go_back", rawText: text };
  }

  const forwardRegex = /^(?:please\s+|can you\s+|could you\s+|just\s+)?(?:go\s+|navigate\s+)?forward$/i;
  const nextRegex = /^(?:please\s+|can you\s+|could you\s+|just\s+)?(?:go\s+(?:to\s+)?)?next(?:\s+page)?$/i;
  if (forwardRegex.test(lower) || nextRegex.test(lower)) {
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


  // Type text into focused field (dictation mode)
  // Must be checked BEFORE fill_form so "type hello" → dictation,
  // but "type hello in name" → fill_form
  const typeTextPatterns = [
    /^(?:type|enter|write|put|dictate)\s+(.+)/i,
  ];
  for (const pattern of typeTextPatterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      const value = match[1].trim();
      // If it contains "in/into/for [field]", it's a fill_form — skip
      if (/\s+(?:in|into|in the|for)\s+/i.test(value)) break;
      return { type: "type_text", target: value, rawText: text };
    }
  }

  // Form filling (requires field name + value)
  const fillPatterns = [
    /^fill\s+(?:the\s+)?(.+?)\s+(?:with|as|to)\s+(.+)/i,
    /^(?:type|enter|put|write|set)\s+(.+?)\s+(?:in|into|in the|for)\s+(?:the\s+)?(.+)/i,
    /^(?:my|the)\s+(.+?)\s+is\s+(.+)/i,
  ];
  for (const pattern of fillPatterns) {
    const match = lower.match(pattern);
    if (match?.[1] && match?.[2]) {
      // For "type X in Y" pattern, field/value are swapped
      if (pattern === fillPatterns[1]) {
        return { type: "fill_form", target: `${match[2].trim()}|${match[1].trim()}`, rawText: text };
      }
      return { type: "fill_form", target: `${match[1].trim()}|${match[2].trim()}`, rawText: text };
    }
  }

  // Submit form or Send current message
  if (matchesAny(lower, [
    "submit", "submit form", "submit the form", "send form", "send the form",
    "send it", "send this", "hit enter", "press enter", "submit this"
  ])) {
    return { type: "submit_form", rawText: text };
  }

  // Send message
  const sendPatterns = [
    /^send\s+(?:a\s+)?message\s+(?:saying\s+|that says\s+)?(.+)/i,
    /^send\s+(.+)/i,
    /^message\s+(?:them|him|her)?\s*(.+)/i,
    /^tell\s+(?:them|him|her)\s+(.+)/i,
    /^write\s+(?:a\s+)?message\s+(.+)/i,
  ];
  for (const pattern of sendPatterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      return { type: "send_message", target: match[1].trim(), rawText: text };
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
 * Parse fill_form commands to extract field name and value.
 * Returns { field, value } or null.
 */
export function parseFillCommand(text: string): { field: string; value: string } | null {
  const patterns = [
    /fill\s+(?:the\s+)?(.+?)\s+(?:with|as|to)\s+(.+)/i,
    /(?:type|enter|put|write|set)\s+(.+?)\s+(?:in|into|in the|for)\s+(?:the\s+)?(.+)/i,
    /(?:my|the)\s+(.+?)\s+is\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // For pattern 2, field and value are swapped
      if (pattern === patterns[1]) {
        return { field: match[2].trim(), value: match[1].trim() };
      }
      return { field: match[1].trim(), value: match[2].trim() };
    }
  }

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

- search: User wants to search for something (extract the search query as target)
- fill_form: User wants to fill a specific form field (extract "fieldname|value" as target)
- type_text: User wants to type/dictate text into the current input field (extract text as target)
- submit_form: User wants to submit a form
- send_message: User wants to send a message (extract message text as target)
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
