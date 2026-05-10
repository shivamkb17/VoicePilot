// ─────────────────────────────────────────────
// VoicePilot — Background Service Worker
// Central AI request router and session manager
// ─────────────────────────────────────────────

import { MSG } from "../utils/constants";
import type {
  ConversationMessage,
  PageContext,
  IntentType,
  OrbState,
} from "../utils/constants";
import { loadSettings } from "../utils/storage";
import { chatWithAI, buildSystemPrompt, classifyIntent } from "../services/ai-chat";
import { detectLocalIntent, buildIntentPrompt } from "../services/intent-router";

console.log("[VoicePilot] Background service worker started.");

// ── Conversation State ─────────────────────────
let conversationHistory: ConversationMessage[] = [];
let lastPageContext: PageContext | null = null;

/** Tab currently owning an active mic session (forwarded to offscreen recorder). */
let recordingTabId: number | null = null;

let creatingOffscreen: Promise<void> | null = null;

const OFFSCREEN_RECORDER_PAGE = "offscreen/recorder.html";

async function ensureOffscreenRecorder(): Promise<void> {
  const url = chrome.runtime.getURL(OFFSCREEN_RECORDER_PAGE);

  if (typeof chrome.runtime.getContexts === "function") {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [url],
      });
      if (contexts.length > 0) return;
    } catch {
      /* ignore */
    }
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_RECORDER_PAGE,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification:
        "VoicePilot captures microphone audio for voice browsing commands.",
    })
    .then(() => undefined)
    .catch((e: Error) => {
      if (!e.message?.includes("single offscreen")) throw e;
    })
    .finally(() => {
      creatingOffscreen = null;
    });

  await creatingOffscreen;
}

async function sendRecorderCommandToOffscreen(message: {
  type:
    | typeof MSG.RECORDER_START
    | typeof MSG.RECORDER_STOP
    | typeof MSG.RECORDER_RESUME;
  tabId: number;
}): Promise<void> {
  await ensureOffscreenRecorder();
  await chrome.runtime.sendMessage(message);
}

interface RecorderEventPayload {
  type: string;
  tabId?: number;
  kind?: string;
  text?: string;
  phase?: string;
  level?: string;
}

async function notifySpeechOutcome(
  tabId: number,
  userText: string,
  aiResponse: string,
  error?: string
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MSG.SPEECH_OUTCOME,
      userText,
      aiResponse,
      error,
    });
  } catch (e) {
    console.warn("[VoicePilot] notifySpeechOutcome:", e);
  }
}

async function handleRecorderEvent(payload: RecorderEventPayload): Promise<void> {
  const { tabId, kind, text, phase, level } = payload;
  if (typeof tabId !== "number" || !kind) return;

  const orbStates: OrbState[] = [
    "idle",
    "listening",
    "processing",
    "speaking",
    "error",
  ];

  try {
    switch (kind) {
      case "mic_ready":
        await chrome.tabs.sendMessage(tabId, {
          type: MSG.UPDATE_STATE,
          state: "listening",
        });
        break;

      case "mic_error":
        await chrome.tabs.sendMessage(tabId, {
          type: MSG.OVERLAY_NOTIFY,
          text: text || "Microphone error",
          level: "error",
        });
        await chrome.tabs.sendMessage(tabId, {
          type: MSG.UPDATE_STATE,
          state: "error",
        });
        break;

      case "phase":
        if (phase && orbStates.includes(phase as OrbState)) {
          await chrome.tabs.sendMessage(tabId, {
            type: MSG.UPDATE_STATE,
            state: phase as OrbState,
          });
        }
        break;

      case "notify":
        await chrome.tabs.sendMessage(tabId, {
          type: MSG.OVERLAY_NOTIFY,
          text: text || "",
          level: level === "error" ? "error" : "status",
        });
        break;

      case "pipeline_text":
        if (text?.trim()) {
          await handleSpeechResult(text.trim(), tabId);
        }
        break;

      default:
        break;
    }
  } catch (e) {
    console.warn("[VoicePilot] handleRecorderEvent:", e);
  }
}

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

    case MSG.MIC_START: {
      const tabId = sender.tab?.id;
      if (!tabId) {
        sendResponse({ ok: false, error: "no_tab" });
        return false;
      }
      recordingTabId = tabId;
      sendRecorderCommandToOffscreen({ type: MSG.RECORDER_START, tabId })
        .then(() => sendResponse({ ok: true }))
        .catch((e) =>
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
        );
      return true;
    }

    case MSG.MIC_STOP: {
      const tabId = sender.tab?.id;
      if (!tabId) {
        sendResponse({ ok: false });
        return false;
      }
      if (recordingTabId === tabId) recordingTabId = null;
      sendRecorderCommandToOffscreen({ type: MSG.RECORDER_STOP, tabId })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: true }));
      return true;
    }

    case MSG.TTS_DONE: {
      const tabId = sender.tab?.id;
      if (!tabId) {
        sendResponse({ ok: false });
        return false;
      }
      sendRecorderCommandToOffscreen({ type: MSG.RECORDER_RESUME, tabId })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: true }));
      return true;
    }

    case MSG.RECORDER_EVENT:
      void handleRecorderEvent(message as RecorderEventPayload);
      return false;

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

chrome.tabs.onRemoved.addListener((tabId) => {
  if (recordingTabId === tabId) {
    recordingTabId = null;
    void sendRecorderCommandToOffscreen({
      type: MSG.RECORDER_STOP,
      tabId,
    }).catch(() => {});
  }
});

// ── Core Speech Handler ─────────────────────────

async function handleSpeechResult(
  text: string,
  tabId?: number
): Promise<{ aiResponse: string; action?: string; actionResult?: string }> {
  try {
    const result = await handleSpeechResultInternal(text, tabId);
    if (tabId !== undefined) {
      await notifySpeechOutcome(tabId, text, result.aiResponse);
    }
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VoicePilot] Speech handling error:", err);
    if (tabId !== undefined) {
      await notifySpeechOutcome(
        tabId,
        text,
        "Sorry, I encountered an error. Please try again.",
        msg
      );
    }
    return {
      aiResponse: "Sorry, I encountered an error. Please try again.",
    };
  }
}

async function handleSpeechResultInternal(
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

      case "go_home":
        try {
          const homeRes = await chrome.tabs.sendMessage(tabId, {
            type: "voicepilot:go_home",
          });
          actionResult = homeRes.result;
        } catch (e) {
          actionResult = "Could not navigate to the homepage.";
        }
        break;

      case "play_media":
        try {
          const playRes = await chrome.tabs.sendMessage(tabId, {
            type: MSG.PLAY_MEDIA,
            target: intent.target || "",
          });
          actionResult = playRes.result;
        } catch (e) {
          actionResult = "Could not play media.";
        }
        break;

      case "search":
        if (intent.target) {
          try {
            const searchRes = await chrome.tabs.sendMessage(tabId, {
              type: MSG.SEARCH,
              query: intent.target,
            });
            actionResult = searchRes.result;
          } catch (e) {
            actionResult = "Could not perform the search.";
          }
        } else {
          actionResult = "SUGGEST: What would you like me to search for?";
        }
        break;

      case "fill_form":
        if (intent.target) {
          try {
            // Target format: "fieldname|value"
            const parts = intent.target.split("|");
            const field = parts[0]?.trim() || "";
            const value = parts[1]?.trim() || "";
            if (field && value) {
              const fillRes = await chrome.tabs.sendMessage(tabId, {
                type: MSG.FILL_FORM,
                field,
                value,
              });
              actionResult = fillRes.result;
            } else {
              actionResult = "SUGGEST: Please specify the field name and value. For example, 'fill name with John'.";
            }
          } catch (e) {
            actionResult = "Could not fill the form field.";
          }
        }
        break;

      case "submit_form":
        try {
          const submitRes = await chrome.tabs.sendMessage(tabId, {
            type: MSG.SUBMIT_FORM,
          });
          actionResult = submitRes.result;
        } catch (e) {
          actionResult = "Could not submit the form.";
        }
        break;

      case "send_message":
        if (intent.target) {
          try {
            const msgRes = await chrome.tabs.sendMessage(tabId, {
              type: MSG.SEND_MESSAGE,
              text: intent.target,
            });
            actionResult = msgRes.result;
          } catch (e) {
            actionResult = "Could not send the message.";
          }
        } else {
          actionResult = "SUGGEST: What message would you like me to send?";
        }
        break;

      case "type_text":
        if (intent.target) {
          try {
            const typeRes = await chrome.tabs.sendMessage(tabId, {
              type: MSG.TYPE_TEXT,
              text: intent.target,
            });
            actionResult = typeRes.result;
          } catch (e) {
            actionResult = "Could not type the text.";
          }
        } else {
          actionResult = "SUGGEST: What would you like me to type?";
        }
        break;
    }
  }

  // Step 4.5: LOCK page media before responding
  // Monkey-patches HTMLMediaElement.play() to block ALL page audio during TTS
  // This fixes the auto-play loop bug (e.g., on ElevenLabs website)
  if (tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: MSG.LOCK_MEDIA });
    } catch (e) {
      // Content script might not be ready
    }
  }

  // Step 5: For simple actions (without suggestions), return directly
  const simpleActions: IntentType[] = [
    "scroll", "go_back", "go_forward", "go_home",
    "play_media", "search", "fill_form", "submit_form", "send_message", "type_text",
  ];
  if (simpleActions.includes(intent.type) && actionResult) {
    return {
      aiResponse: actionResult,
      action: intent.type,
      actionResult,
    };
  }

  // If navigation/click succeeded cleanly (no SUGGEST:), return directly
  if (
    actionResult &&
    !actionResult.startsWith("SUGGEST:") &&
    (intent.type === "navigate_section" || intent.type === "click_element")
  ) {
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
