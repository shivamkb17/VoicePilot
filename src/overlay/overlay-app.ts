// ─────────────────────────────────────────────
// VoicePilot — Overlay UI (page iframe)
// Mic capture + STT run in offscreen document (bypasses strict Permissions Policy).
// ─────────────────────────────────────────────

import type { OrbState } from "../utils/constants";
import { MSG } from "../utils/constants";

// ── DOM References ─────────────────────────
const voiceOrb = document.getElementById("voice-orb")!;
const orbWrapper = document.getElementById("orb-wrapper")!;
const statusLabel = document.getElementById("orb-status-label")!;
const transcriptPanel = document.getElementById("transcript-panel")!;
const transcriptMessages = document.getElementById("transcript-messages")!;
const iconMic = document.getElementById("orb-icon-mic")!;
const iconProcessing = document.getElementById("orb-icon-processing")!;
const waveformEl = document.getElementById("orb-waveform")!;
const waveformBars = waveformEl.querySelectorAll<HTMLElement>(".waveform-bar");

// ── State ──────────────────────────────────
let currentState: OrbState = "idle";
let isMicActive = false;
let waveformInterval: ReturnType<typeof setInterval> | null = null;
let ttsAudio: HTMLAudioElement | null = null;
let transcriptHideTimer: ReturnType<typeof setTimeout> | null = null;

// ── Initialize ─────────────────────────────

function init() {
  voiceOrb.addEventListener("click", handleOrbClick);
  voiceOrb.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOrbClick();
    }
  });

  window.addEventListener("message", handleParentMessage);

  console.log("[VoicePilot] Overlay initialized (UI; mic handled offscreen).");
  setState("idle");
}

// ── Notify Parent to Resize ────────────────

function requestResize(expanded: boolean) {
  window.parent.postMessage({ type: "voicepilot:resize", expanded }, "*");
}

/** Tell content script → background → offscreen to resume listening after TTS */
function notifyTtsDone() {
  try {
    window.parent.postMessage({ type: "voicepilot:tts_done" }, "*");
  } catch {
    /* ignore */
  }
}

// ── State Machine ──────────────────────────

function setState(state: OrbState) {
  currentState = state;
  voiceOrb.setAttribute("data-state", state);

  iconMic.style.display = "none";
  iconProcessing.style.display = "none";
  waveformEl.style.display = "none";

  switch (state) {
    case "idle":
      iconMic.style.display = "block";
      statusLabel.textContent = "Click to enable mic";
      orbWrapper.classList.remove("active");
      stopWaveformAnimation();
      break;

    case "listening":
      iconMic.style.display = "block";
      statusLabel.textContent = "Listening...";
      orbWrapper.classList.add("active");
      stopWaveformAnimation();
      break;

    case "processing":
      iconProcessing.style.display = "block";
      statusLabel.textContent = "Thinking...";
      orbWrapper.classList.add("active");
      stopWaveformAnimation();
      break;

    case "speaking":
      waveformEl.style.display = "flex";
      statusLabel.textContent = "Speaking...";
      orbWrapper.classList.add("active");
      startWaveformAnimation();
      break;

    case "error":
      iconMic.style.display = "block";
      statusLabel.textContent = "Error — tap to retry";
      orbWrapper.classList.add("active");
      stopWaveformAnimation();
      setTimeout(() => {
        if (!isMicActive) setState("idle");
        else setState("listening");
      }, 3000);
      break;
  }
}

// ── Orb Click Handler ──────────────────────

function handleOrbClick() {
  if (currentState === "speaking") {
    stopSpeaking();
    return;
  }

  if (isMicActive) {
    try {
      window.parent.postMessage({ type: "voicepilot:mic_stop" }, "*");
    } catch {
      /* ignore */
    }
    isMicActive = false;
    setState("idle");
    hideTranscript();
    requestResize(false);
  } else {
    isMicActive = true;
    addMessage("🎤 Mic enabled! Just speak — I'm always listening.", "status");
    showTranscript();
    requestResize(true);
    try {
      window.parent.postMessage({ type: "voicepilot:mic_start" }, "*");
    } catch {
      /* ignore */
    }
    scheduleTranscriptHide(5000);
  }
}

// ── AI result + TTS ─────────────────────────

async function handleSpeechOutcome(payload: {
  userText?: string;
  aiResponse?: string;
  error?: string;
}) {
  removeInterimMessage();
  const { userText, aiResponse, error } = payload;

  if (userText?.trim()) {
    addMessage(userText.trim(), "user");
  }

  if (error) {
    console.warn("[VoicePilot] Pipeline error detail:", error);
  }

  const reply =
    aiResponse ||
    "Sorry, I couldn't process that. Please try again.";

  addMessage(reply, "assistant");
  setState("processing");
  statusLabel.textContent = "Replying...";
  await speakResponse(reply);
}

// ── TTS Playback ───────────────────────────

async function speakResponse(text: string) {
  setState("speaking");

  try {
    const settings = await chrome.runtime.sendMessage({
      type: MSG.GET_SETTINGS,
    });

    if (settings?.elevenlabsKey) {
      await speakWithElevenLabs(text, settings);
    } else {
      await speakWithBrowserTTS(text);
    }
  } catch (err) {
    console.warn("[VoicePilot] TTS error, falling back:", err);
    try {
      await speakWithBrowserTTS(text);
    } catch {
      /* silent */
    }
  }

  try {
    window.parent.postMessage({ type: "voicepilot:unlock_media" }, "*");
  } catch {
    /* ignore */
  }

  notifyTtsDone();

  if (isMicActive) {
    setState("listening");
    scheduleTranscriptHide(6000);
  }
}

async function speakWithElevenLabs(
  text: string,
  settings: { elevenlabsKey: string; voiceId?: string; proxyUrl?: string }
): Promise<void> {
  const voiceId = settings.voiceId || "21m00Tcm4TlvDq8ikWAM";
  const url = settings.proxyUrl
    ? `${settings.proxyUrl}/api/tts`
    : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!settings.proxyUrl) {
    headers["xi-api-key"] = settings.elevenlabsKey;
  } else {
    headers["X-API-Key"] = settings.elevenlabsKey;
  }

  const body: Record<string, unknown> = {
    text,
    model_id: "eleven_turbo_v2_5",
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  };
  if (settings.proxyUrl) body.voice_id = voiceId;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) throw new Error(`TTS ${res.status}`);

  const blob = await res.blob();
  const audioUrl = URL.createObjectURL(blob);
  ttsAudio = new Audio(audioUrl);

  return new Promise((resolve, reject) => {
    ttsAudio!.onended = () => {
      URL.revokeObjectURL(audioUrl);
      resolve();
    };
    ttsAudio!.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      reject(new Error("Audio playback failed"));
    };
    ttsAudio!.play().catch(reject);
  });
}

function speakWithBrowserTTS(text: string): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.speak(utterance);
  });
}

function stopSpeaking() {
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.currentTime = 0;
    ttsAudio = null;
  }
  speechSynthesis.cancel();
  notifyTtsDone();
  if (isMicActive) setState("listening");
}

// ── Transcript UI ──────────────────────────

function showTranscript() {
  if (transcriptHideTimer) {
    clearTimeout(transcriptHideTimer);
    transcriptHideTimer = null;
  }
  transcriptPanel.classList.add("visible");
  requestResize(true);
}

function hideTranscript() {
  transcriptPanel.classList.remove("visible");
  if (isMicActive) requestResize(false);
}

function scheduleTranscriptHide(ms: number) {
  if (transcriptHideTimer) clearTimeout(transcriptHideTimer);
  transcriptHideTimer = setTimeout(() => {
    if (currentState === "listening") hideTranscript();
  }, ms);
}

function addMessage(text: string, type: "user" | "assistant" | "status") {
  const el = document.createElement("div");
  el.className = `transcript-message ${type}`;
  el.textContent = text;
  transcriptMessages.appendChild(el);
  transcriptPanel.scrollTop = transcriptPanel.scrollHeight;

  while (transcriptMessages.children.length > 20) {
    transcriptMessages.removeChild(transcriptMessages.firstChild!);
  }
  showTranscript();
}

let interimEl: HTMLElement | null = null;

function removeInterimMessage() {
  if (interimEl) {
    interimEl.remove();
    interimEl = null;
  }
}

// ── Waveform Animation ─────────────────────

function startWaveformAnimation() {
  stopWaveformAnimation();
  waveformInterval = setInterval(() => {
    waveformBars.forEach((bar) => {
      bar.style.height = `${6 + Math.random() * 18}px`;
    });
  }, 120);
}

function stopWaveformAnimation() {
  if (waveformInterval) {
    clearInterval(waveformInterval);
    waveformInterval = null;
  }
  waveformBars.forEach((bar) => {
    bar.style.height = "8px";
  });
}

// ── Parent Message Handler ─────────────────

function handleParentMessage(event: MessageEvent) {
  if (!event.data?.type?.startsWith("voicepilot:")) return;

  if (event.data.type === "voicepilot:speech_outcome") {
    void handleSpeechOutcome({
      userText: event.data.userText,
      aiResponse: event.data.aiResponse,
      error: event.data.error,
    });
    return;
  }

  if (event.data.type === "voicepilot:overlay_notify") {
    const text = event.data.text || "";
    if (text) addMessage(text, "status");
    if (event.data.level === "error") {
      isMicActive = false;
      setState("error");
    }
    return;
  }

  if (event.data.type === "voicepilot:state_update") {
    if (event.data.state) setState(event.data.state as OrbState);
    if (event.data.text) addMessage(event.data.text, "assistant");
    if (event.data.userText) addMessage(event.data.userText, "user");
  }
}

// ── Start ──────────────────────────────────
init();
