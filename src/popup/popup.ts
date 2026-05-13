// ─────────────────────────────────────────────
// VoicePilot — Popup Settings Controller
// ─────────────────────────────────────────────

import { MSG } from "../utils/constants";

const form = document.getElementById("settings-form") as HTMLFormElement;
const llmProviderSelect = document.getElementById("llm-provider") as HTMLSelectElement;
const llmKeyLabel = document.getElementById("llm-key-label") as HTMLLabelElement;
const llmKeyLink = document.getElementById("llm-key-link") as HTMLAnchorElement;
const openaiKeyInput = document.getElementById("openai-key") as HTMLInputElement;
const elevenlabsKeyInput = document.getElementById("elevenlabs-key") as HTMLInputElement;
const firecrawlKeyInput = document.getElementById("firecrawl-key") as HTMLInputElement;
const proxyUrlInput = document.getElementById("proxy-url") as HTMLInputElement;
const voiceIdInput = document.getElementById("voice-id") as HTMLInputElement;
const subtitlesToggle = document.getElementById("subtitles-toggle") as HTMLInputElement;
const statusMsg = document.getElementById("status-msg")!;

function updateLLMLabels() {
  const provider = llmProviderSelect.value;
  if (provider === "openrouter") {
    llmKeyLabel.childNodes[0].nodeValue = "OpenRouter API Key ";
    llmKeyLink.href = "https://openrouter.ai/workspaces/default/keys";
    openaiKeyInput.placeholder = "sk-or-v1-...";
  } else {
    llmKeyLabel.childNodes[0].nodeValue = "OpenAI API Key ";
    llmKeyLink.href = "https://platform.openai.com/api-keys";
    openaiKeyInput.placeholder = "sk-...";
  }
}

llmProviderSelect.addEventListener("change", updateLLMLabels);

// Load saved settings on open
async function loadSavedSettings() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: MSG.GET_SETTINGS });
    if (settings) {
      llmProviderSelect.value = settings.llmProvider || "openrouter";
      updateLLMLabels();
      openaiKeyInput.value = settings.openaiKey || "";
      elevenlabsKeyInput.value = settings.elevenlabsKey || "";
      firecrawlKeyInput.value = settings.firecrawlKey || "";
      proxyUrlInput.value = settings.proxyUrl || "";
      voiceIdInput.value = settings.voiceId || "";
      subtitlesToggle.checked = settings.subtitlesEnabled !== false;
    }
  } catch (e) {
    console.error("[VoicePilot] Failed to load settings:", e);
  }
}

// Save settings
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const settings = {
    llmProvider: llmProviderSelect.value,
    openaiKey: openaiKeyInput.value.trim(),
    elevenlabsKey: elevenlabsKeyInput.value.trim(),
    firecrawlKey: firecrawlKeyInput.value.trim(),
    proxyUrl: proxyUrlInput.value.trim(),
    voiceId: voiceIdInput.value.trim() || "21m00Tcm4TlvDq8ikWAM",
    subtitlesEnabled: subtitlesToggle.checked,
  };

  try {
    await chrome.runtime.sendMessage({
      type: MSG.SAVE_SETTINGS,
      settings,
    });

    statusMsg.textContent = "✓ Settings saved successfully!";
    statusMsg.style.color = "#34d399";

    setTimeout(() => {
      statusMsg.textContent = "";
    }, 3000);
  } catch (e) {
    statusMsg.textContent = "✗ Failed to save settings.";
    statusMsg.style.color = "#ef4444";
  }
});

loadSavedSettings();
