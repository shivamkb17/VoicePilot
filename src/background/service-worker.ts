// ─────────────────────────────────────────────
// VoicePilot — Background Service Worker
// Central AI request router and session manager
// ─────────────────────────────────────────────

import { MSG } from "../utils/constants";
import type {
  ConversationMessage,
  PageContext,
  IntentType,
} from "../utils/constants";
import { loadSettings } from "../utils/storage";
import { chatWithAI, buildSystemPrompt, classifyIntent } from "../services/ai-chat";
import { detectLocalIntent, buildIntentPrompt } from "../services/intent-router";

console.log("[VoicePilot] Background service worker started.");

// ── Conversation State ─────────────────────────
let conversationHistory: ConversationMessage[] = [];
let lastPageContext: PageContext | null = null;

// ── Message Router ─────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message.type?.startsWith("voicepilot:")) return false;

  switch (message.type) {
    case MSG.SPEECH_RESULT:
      handleSpeechResult(message.text, sender.tab?.id)
        .then(sendResponse)
        .catch((err) => {
          console.error("[VoicePilot] Speech handling error:", err);
          sendResponse({
            error: err.message,
            aiResponse: "Sorry, I encountered an error. Please try again.",
          });
        });
      return true; // Async response

    case MSG.GET_SETTINGS:
      loadSettings().then(sendResponse);
      return true;

    case MSG.SAVE_SETTINGS:
      import("../utils/storage").then(({ saveSettings }) => {
        saveSettings(message.settings).then(() => sendResponse({ ok: true }));
      });
      return true;

    default:
      return false;
  }
});

// ── Core Speech Handler ─────────────────────────

async function handleSpeechResult(
  text: string,
  tabId?: number
): Promise<{ aiResponse: string; action?: string; actionResult?: string }> {
  if (!text?.trim()) {
    return { aiResponse: "I didn't catch that. Could you say it again?" };
  }

  const settings = await loadSettings();

  if (!settings.openaiKey && !settings.proxyUrl) {
    return {
      aiResponse:
        "Please set up your OpenAI API key or proxy URL in the VoicePilot settings.",
    };
  }

  // Step 1: Get page context from content script
  if (tabId) {
    try {
      lastPageContext = await chrome.tabs.sendMessage(tabId, {
        type: MSG.GET_PAGE_CONTEXT,
      });
    } catch (err) {
      console.warn("[VoicePilot] Could not get page context:", err);
    }
  }

  // Step 2: Try local intent detection first
  let intent = detectLocalIntent(text);

  // Step 3: If no local match, use AI classification
  if (!intent) {
    const intentPrompt = buildIntentPrompt(text);
    const classified = await classifyIntent(
      intentPrompt,
      settings.openaiKey,
      settings.proxyUrl || undefined
    );
    intent = {
      type: classified.type as IntentType,
      target: classified.target || undefined,
      rawText: text,
    };
  }

  // Step 4: Execute navigation actions directly
  let actionResult: string | undefined;

  if (tabId) {
    switch (intent.type) {
      case "scroll":
        try {
          const scrollRes = await chrome.tabs.sendMessage(tabId, {
            type: MSG.SCROLL,
            direction: intent.target || "down",
          });
          actionResult = scrollRes.result;
        } catch (e) {
          actionResult = "Could not scroll the page.";
        }
        break;

      case "navigate_section":
        if (intent.target) {
          try {
            const navRes = await chrome.tabs.sendMessage(tabId, {
              type: MSG.NAVIGATE,
              target: intent.target,
            });
            actionResult = navRes.result;
          } catch (e) {
            actionResult = "Could not navigate to that section.";
          }
        }
        break;

      case "click_element":
        if (intent.target) {
          try {
            const clickRes = await chrome.tabs.sendMessage(tabId, {
              type: MSG.CLICK_ELEMENT,
              target: intent.target,
            });
            actionResult = clickRes.result;
          } catch (e) {
            actionResult = "Could not click that element.";
          }
        }
        break;

      case "go_back":
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: "voicepilot:go_back",
          });
          actionResult = "Going back to the previous page.";
        } catch (e) {
          actionResult = "Could not go back.";
        }
        break;

      case "go_forward":
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: "voicepilot:go_forward",
          });
          actionResult = "Going forward.";
        } catch (e) {
          actionResult = "Could not go forward.";
        }
        break;
    }
  }

  // Step 5: For simple actions, return the result directly
  const simpleActions: IntentType[] = ["scroll", "go_back", "go_forward"];
  if (simpleActions.includes(intent.type) && actionResult) {
    return {
      aiResponse: actionResult,
      action: intent.type,
      actionResult,
    };
  }

  // Step 6: For complex intents, chat with AI
  const systemPrompt = lastPageContext
    ? buildSystemPrompt(lastPageContext)
    : "You are VoicePilot, a voice assistant that helps users browse websites. You currently don't have page context. Ask the user to refresh or try again.";

  // Build conversation with context
  const messages: ConversationMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: text },
  ];

  // Add action context if we performed a navigation action
  if (actionResult) {
    messages.push({
      role: "system",
      content: `[ACTION PERFORMED: ${intent.type} → ${actionResult}. Briefly confirm this to the user.]`,
    });
  }

  const aiResponse = await chatWithAI(
    messages,
    settings.openaiKey,
    settings.proxyUrl || undefined
  );

  // Save to conversation history
  conversationHistory.push(
    { role: "user", content: text },
    { role: "assistant", content: aiResponse }
  );

  // Trim history
  if (conversationHistory.length > 40) {
    conversationHistory = conversationHistory.slice(-20);
  }

  // Step 7: Notify content script to update overlay state
  if (tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: MSG.UPDATE_STATE,
        state: "speaking",
        text: aiResponse,
        userText: text,
      });
    } catch (e) {
      // Tab may have closed
    }
  }

  return {
    aiResponse,
    action: intent.type,
    actionResult,
  };
}

// Clear conversation when tab changes
chrome.tabs.onActivated.addListener(() => {
  conversationHistory = [];
  lastPageContext = null;
});

// Clear conversation when tab navigates
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    conversationHistory = [];
    lastPageContext = null;
  }
});
