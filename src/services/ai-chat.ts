// ─────────────────────────────────────────────
// VoicePilot — OpenAI Chat Service
// ─────────────────────────────────────────────

import type { ConversationMessage, PageContext } from "../utils/constants";

const MAX_HISTORY = 20;

/**
 * Build the system prompt with page context
 */
export function buildSystemPrompt(pageContext: PageContext): string {
  return `You are VoicePilot, a friendly voice assistant that helps users browse websites completely hands-free. You are being spoken aloud via text-to-speech.

CURRENT WEBPAGE:
URL: ${pageContext.url}
Title: ${pageContext.title}
Description: ${pageContext.metaDescription}
Headings: ${pageContext.headings.map((h) => `${"#".repeat(h.level)} ${h.text}`).join("\n  ")}
Sections: ${pageContext.sections.map((s) => `[${s.heading}]: ${s.text.slice(0, 150)}...`).join("\n  ")}
Buttons: ${pageContext.buttons.map((b) => b.text).join(", ")}
Nav links: ${pageContext.links.slice(0, 15).map((l) => l.text).join(", ")}
Forms: ${pageContext.forms.length} form(s)

CONTENT PREVIEW:
${pageContext.mainContent.slice(0, 2000)}

CRITICAL RULES FOR VOICE RESPONSES:
1. You are being spoken aloud. NEVER use bullet points, markdown, numbered lists, asterisks, or special formatting.
2. Keep responses to 2-3 sentences maximum. Be warm, direct, and conversational.
3. Use first person: "I found the pricing section" not "The pricing section is located at..."
4. Never say you're reading from "context" or "data" — you naturally know the page.
5. If a navigation action had a "SUGGEST:" prefix, it means the exact match wasn't found. Present the available options conversationally. For example: "I couldn't find that exact section, but I see Home, About, Pricing, and Contact. Which one did you mean?"
6. When listing available sections or buttons, say them naturally, not as a list. Example: "You can go to Home, Features, Pricing, or Contact."
7. Be honest if you don't know something.
8. Sound natural and human, like a helpful friend.`;
}

/**
 * Call OpenAI Chat Completions API
 */
export async function chatWithAI(
  messages: ConversationMessage[],
  apiKey: string,
  proxyUrl?: string
): Promise<string> {
  const url = proxyUrl
    ? `${proxyUrl}/api/chat`
    : "https://api.openai.com/v1/chat/completions";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!proxyUrl) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "gpt-4o",
      messages: messages.slice(-MAX_HISTORY),
      max_tokens: 300,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} — ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "I'm not sure how to respond to that.";
}

/**
 * Classify intent using AI (for ambiguous inputs)
 */
export async function classifyIntent(
  prompt: string,
  apiKey: string,
  proxyUrl?: string
): Promise<{ type: string; target: string | null }> {
  const url = proxyUrl
    ? `${proxyUrl}/api/chat`
    : "https://api.openai.com/v1/chat/completions";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!proxyUrl) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 100,
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    return { type: "general_question", target: null };
  }

  const data = await response.json();
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return { type: "general_question", target: null };
  }
}
