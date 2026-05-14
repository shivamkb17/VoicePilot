// ─────────────────────────────────────────────
// VoicePilot — Content Script Entry Point
// Injects the floating overlay and handles messages
// ─────────────────────────────────────────────

import { MSG } from "../utils/constants";
import { extractPageContext } from "./dom-extractor";
import {
  scrollPage,
  navigateToSection,
  clickElement,
  goBack,
  goForward,
  goHome,
  pauseAllPageMedia,
  resumePageMedia,

  searchOnPage,
  lockPageMedia,
  unlockPageMedia,
  fillFormField,
  submitCurrentForm,
  sendMessage,
  typeTextIntoFocused,
} from "./navigator";

console.log("[VoicePilot] Content script loaded on:", window.location.href);

// ── Overlay Injection ─────────────────────────

let overlayIframe: HTMLIFrameElement | null = null;
let isExpanded = false;

// Avoid injecting into embedded iframes (reduces duplicate UI & policy issues on sites like Facebook)
const isMainFrame = window === window.top;
if (!isMainFrame) {
  console.log("[VoicePilot] Skipping overlay in subframe.");
}

function injectOverlay() {
  if (overlayIframe) return;

  overlayIframe = document.createElement("iframe");
  overlayIframe.id = "voicepilot-overlay";
  overlayIframe.src = chrome.runtime.getURL("overlay/overlay.html");

  // Start SMALL (just the orb) — NO pointer-events: none
  // The iframe is small enough that it doesn't block page interaction
  applyIframeStyle(false);

  // Allow microphone access inside the iframe
  overlayIframe.setAttribute("allow", "microphone *");

  document.body.appendChild(overlayIframe);
  console.log("[VoicePilot] Overlay injected.");
}

function applyIframeStyle(expanded: boolean) {
  if (!overlayIframe) return;
  isExpanded = expanded;

  if (expanded) {
    overlayIframe.setAttribute(
      "style",
      [
        "position: fixed",
        "bottom: 20px",
        "right: 20px",
        "width: 400px",
        "height: 480px",
        "border: none",
        "z-index: 2147483647",
        "background: transparent",
        "transition: width 0.3s cubic-bezier(0.4,0,0.2,1), height 0.3s cubic-bezier(0.4,0,0.2,1)",
        "color-scheme: only light", // Prevent dark mode override
      ].join(";")
    );
  } else {
    overlayIframe.setAttribute(
      "style",
      [
        "position: fixed",
        "bottom: 20px",
        "right: 20px",
        "width: 100px",
        "height: 100px",
        "border: none",
        "z-index: 2147483647",
        "background: transparent",
        "transition: width 0.3s cubic-bezier(0.4,0,0.2,1), height 0.3s cubic-bezier(0.4,0,0.2,1)",
        "color-scheme: only light",
      ].join(";")
    );
  }
}

// Inject on load (main frame only)
if (isMainFrame) {
  injectOverlay();
}

// ── Message Handling ─────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case MSG.GET_PAGE_CONTEXT: {
      const context = extractPageContext();
      sendResponse(context);
      return false;
    }

    case MSG.SCROLL: {
      const result = scrollPage(message.direction || "down");
      sendResponse({ result });
      return false;
    }

    case MSG.NAVIGATE: {
      const result = navigateToSection(message.target || "");
      sendResponse({ result });
      return false;
    }

    case MSG.CLICK_ELEMENT: {
      const result = clickElement(message.target || "");
      sendResponse({ result });
      return false;
    }

    case "voicepilot:go_back": {
      const result = goBack();
      sendResponse({ result });
      return false;
    }

    case "voicepilot:go_forward": {
      const result = goForward();
      sendResponse({ result });
      return false;
    }

    case "voicepilot:go_home": {
      const result = goHome();
      sendResponse({ result });
      return false;
    }

    case MSG.PAUSE_MEDIA: {
      const result = pauseAllPageMedia();
      sendResponse({ result });
      return false;
    }

    case MSG.RESUME_MEDIA: {
      const result = resumePageMedia();
      sendResponse({ result });
      return false;
    }



    case MSG.SEARCH: {
      const result = searchOnPage(message.query || "");
      sendResponse({ result });
      return false;
    }

    case MSG.LOCK_MEDIA: {
      const result = lockPageMedia();
      sendResponse({ result });
      return false;
    }

    case MSG.UNLOCK_MEDIA: {
      const result = unlockPageMedia();
      sendResponse({ result });
      return false;
    }

    case MSG.FILL_FORM: {
      const result = fillFormField(message.field || "", message.value || "");
      sendResponse({ result });
      return false;
    }

    case MSG.SUBMIT_FORM: {
      const result = submitCurrentForm();
      sendResponse({ result });
      return false;
    }

    case MSG.SEND_MESSAGE: {
      const result = sendMessage(message.text || "");
      sendResponse({ result });
      return false;
    }

    case MSG.TYPE_TEXT: {
      typeTextIntoFocused(message.text || "").then((result) => {
        sendResponse({ result });
      });
      return true; // Async — keep message port open
    }

    case MSG.UPDATE_STATE: {
      // Forward state update to overlay iframe
      overlayIframe?.contentWindow?.postMessage(
        { type: "voicepilot:state_update", ...message },
        "*"
      );
      sendResponse({ ok: true });
      return false;
    }

    case MSG.SPEECH_OUTCOME: {
      overlayIframe?.contentWindow?.postMessage(
        {
          type: "voicepilot:speech_outcome",
          userText: message.userText,
          aiResponse: message.aiResponse,
          error: message.error,
        },
        "*"
      );
      sendResponse({ ok: true });
      return false;
    }

    case MSG.OVERLAY_NOTIFY: {
      overlayIframe?.contentWindow?.postMessage(
        {
          type: "voicepilot:overlay_notify",
          text: message.text,
          level: message.level,
        },
        "*"
      );
      sendResponse({ ok: true });
      return false;
    }

    default:
      return false;
  }
});

// Listen for messages FROM the overlay iframe
window.addEventListener("message", (event) => {
  // Only accept messages from our overlay iframe
  if (event.source !== overlayIframe?.contentWindow) return;
  if (!event.data?.type?.startsWith("voicepilot:")) return;

  // Handle resize requests from overlay
  if (event.data.type === "voicepilot:resize") {
    applyIframeStyle(event.data.expanded === true);
    return;
  }

  // Handle media unlock from overlay (after TTS finishes)
  if (event.data.type === "voicepilot:unlock_media") {
    unlockPageMedia();
    return;
  }

  // Mic / TTS bridge — must originate from content script so background gets sender.tab.id
  if (event.data.type === "voicepilot:mic_start") {
    chrome.runtime.sendMessage({ type: MSG.MIC_START });
    return;
  }
  if (event.data.type === "voicepilot:mic_stop") {
    chrome.runtime.sendMessage({ type: MSG.MIC_STOP });
    return;
  }
  if (event.data.type === "voicepilot:tts_done") {
    chrome.runtime.sendMessage({ type: MSG.TTS_DONE });
    return;
  }

  if (event.data.type === "voicepilot:check_mic_state") {
    chrome.runtime.sendMessage({ type: MSG.CHECK_MIC_STATE }, (response) => {
      if (response?.isActive) {
        overlayIframe?.contentWindow?.postMessage(
          { type: "voicepilot:mic_restored" },
          "*"
        );
      }
    });
    return;
  }

  // Forward everything else to background service worker
  chrome.runtime.sendMessage(event.data);
});
