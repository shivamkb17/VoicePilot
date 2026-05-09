// ─────────────────────────────────────────────
// VoicePilot — Chrome Runtime Messaging Helpers
// ─────────────────────────────────────────────

/**
 * Send a message to the background service worker
 */
export async function sendToBackground<T = unknown>(
  type: string,
  payload?: Record<string, unknown>
): Promise<T> {
  return chrome.runtime.sendMessage({ type, ...payload });
}

/**
 * Send a message to a specific tab's content script
 */
export async function sendToTab<T = unknown>(
  tabId: number,
  type: string,
  payload?: Record<string, unknown>
): Promise<T> {
  return chrome.tabs.sendMessage(tabId, { type, ...payload });
}

/**
 * Listen for messages of a specific type
 */
export function onMessage(
  type: string,
  handler: (
    message: Record<string, unknown>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => void | boolean | Promise<unknown>
) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === type) {
      const result = handler(message, sender, sendResponse);
      // Return true for async responses
      if (result instanceof Promise) {
        result.then(sendResponse).catch((err) => {
          console.error(`[VoicePilot] Message handler error for ${type}:`, err);
          sendResponse({ error: err.message });
        });
        return true;
      }
      return result;
    }
  });
}

/**
 * Listen for messages matching multiple types
 */
export function onMessages(
  handlers: Record<
    string,
    (
      message: Record<string, unknown>,
      sender: chrome.runtime.MessageSender
    ) => Promise<unknown> | unknown
  >
) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers[message.type];
    if (handler) {
      const result = handler(message, sender);
      if (result instanceof Promise) {
        result.then(sendResponse).catch((err) => {
          console.error(`[VoicePilot] Handler error for ${message.type}:`, err);
          sendResponse({ error: err.message });
        });
        return true;
      }
      sendResponse(result);
    }
  });
}
