// ─────────────────────────────────────────────
// VoicePilot — OpenAI Chat Service
// ─────────────────────────────────────────────

import type { ConversationMessage, PageContext } from "../utils/constants";

const MAX_HISTORY = 20;

/**
 * Build the system prompt with page context
 */
export function buildSystemPrompt(pageContext: PageContext): string {
  return `You are VoicePilot, a friendly and concise voice assistant that helps users browse websites hands-free.

CURRENT WEBPAGE CONTEXT:
- URL: ${pageContext.url}
- Title: ${pageContext.title}
- Description: ${pageContext.metaDescription}
- Headings: ${pageContext.headings.map((h) => `${"#".repeat(h.level)} ${h.text}`).join("\n  ")}
- Sections: ${pageContext.sections.map((s) => `[${s.heading}]: ${s.text.slice(0, 150)}...`).join("\n  ")}
- Buttons available: ${pageContext.buttons.map((b) => b.text).join(", ")}
- Navigation links: ${pageContext.links.slice(0, 15).map((l) => l.text).join(", ")}
- Forms: ${pageContext.forms.length} form(s) found
- Images: ${pageContext.images} image(s)

CONTENT PREVIEW:
${pageContext.mainContent.slice(0, 2000)}

INSTRUCTIONS:
1. Be CONCISE. Your responses will be spoken aloud via TTS, so keep them short and natural.
2. Respond conversationally as if talking to a friend.
3. When the user asks about the page, use the context above to give accurate answers.
4. If the user wants to navigate or interact, describe what you're doing.
5. For accessibility users, be descriptive about page layout and content.
6. Never mention that you're reading from "context" or "DOM data" — just naturally know the page.
7. Keep responses under 3 sentences unless the user asks for detail.
8. If you don't know something, say so honestly.`;
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
