// ─────────────────────────────────────────────
// VoicePilot — Chrome Storage Helpers
// ─────────────────────────────────────────────

import { STORAGE_KEYS, DEFAULTS } from "./constants";

export interface VoicePilotSettings {
  llmProvider: string;
  openaiKey: string;
  elevenlabsKey: string;
  firecrawlKey: string;
  proxyUrl: string;
  voiceId: string;
  alwaysListening: boolean;
  subtitlesEnabled: boolean;
}

/**
 * Load all settings from chrome.storage.local
 */
export async function loadSettings(): Promise<VoicePilotSettings> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.LLM_PROVIDER,
    STORAGE_KEYS.OPENAI_KEY,
    STORAGE_KEYS.ELEVENLABS_KEY,
    STORAGE_KEYS.FIRECRAWL_KEY,
    STORAGE_KEYS.PROXY_URL,
    STORAGE_KEYS.VOICE_ID,
    STORAGE_KEYS.ALWAYS_LISTENING,
    STORAGE_KEYS.SUBTITLES_ENABLED,
  ]);

  return {
    llmProvider: result[STORAGE_KEYS.LLM_PROVIDER] || DEFAULTS.LLM_PROVIDER,
    openaiKey: result[STORAGE_KEYS.OPENAI_KEY] || DEFAULTS.OPENAI_KEY,
    elevenlabsKey: result[STORAGE_KEYS.ELEVENLABS_KEY] || DEFAULTS.ELEVENLABS_KEY,
    firecrawlKey: result[STORAGE_KEYS.FIRECRAWL_KEY] || DEFAULTS.FIRECRAWL_KEY,
    proxyUrl: result[STORAGE_KEYS.PROXY_URL] || DEFAULTS.PROXY_URL,
    voiceId: result[STORAGE_KEYS.VOICE_ID] || DEFAULTS.VOICE_ID,
    alwaysListening:
      result[STORAGE_KEYS.ALWAYS_LISTENING] ?? DEFAULTS.ALWAYS_LISTENING,
    subtitlesEnabled:
      result[STORAGE_KEYS.SUBTITLES_ENABLED] ?? DEFAULTS.SUBTITLES_ENABLED,
  };
}

/**
 * Save settings to chrome.storage.local
 */
export async function saveSettings(
  settings: Partial<VoicePilotSettings>
): Promise<void> {
  const storageData: Record<string, unknown> = {};

  if (settings.llmProvider !== undefined)
    storageData[STORAGE_KEYS.LLM_PROVIDER] = settings.llmProvider;
  if (settings.openaiKey !== undefined)
    storageData[STORAGE_KEYS.OPENAI_KEY] = settings.openaiKey;
  if (settings.elevenlabsKey !== undefined)
    storageData[STORAGE_KEYS.ELEVENLABS_KEY] = settings.elevenlabsKey;
  if (settings.firecrawlKey !== undefined)
    storageData[STORAGE_KEYS.FIRECRAWL_KEY] = settings.firecrawlKey;
  if (settings.proxyUrl !== undefined)
    storageData[STORAGE_KEYS.PROXY_URL] = settings.proxyUrl;
  if (settings.voiceId !== undefined)
    storageData[STORAGE_KEYS.VOICE_ID] = settings.voiceId;
  if (settings.alwaysListening !== undefined)
    storageData[STORAGE_KEYS.ALWAYS_LISTENING] = settings.alwaysListening;
  if (settings.subtitlesEnabled !== undefined)
    storageData[STORAGE_KEYS.SUBTITLES_ENABLED] = settings.subtitlesEnabled;

  await chrome.storage.local.set(storageData);
}

/**
 * Get a single setting value
 */
export async function getSetting<K extends keyof VoicePilotSettings>(
  key: K
): Promise<VoicePilotSettings[K]> {
  const settings = await loadSettings();
  return settings[key];
}
