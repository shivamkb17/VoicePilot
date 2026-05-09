// ─────────────────────────────────────────────
// VoicePilot — Overlay App Controller
// Manages Voice Orb interactions, STT, and TTS
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
let recognition: SpeechRecognition | null = null;
let isListening = false;
let speechTimeout: ReturnType<typeof setTimeout> | null = null;
let waveformInterval: ReturnType<typeof setInterval> | null = null;
let ttsAudio: HTMLAudioElement | null = null;

// ── Initialize ─────────────────────────────

function init() {
  // Make orb clickable
  voiceOrb.style.pointerEvents = "auto";

  voiceOrb.addEventListener("click", toggleListening);
  voiceOrb.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleListening();
    }
  });

  // Listen for state updates from content script
  window.addEventListener("message", handleParentMessage);

  console.log("[VoicePilot] Overlay initialized.");
  setState("idle");
}

// ── State Machine ──────────────────────────

function setState(state: OrbState) {
  currentState = state;
  voiceOrb.setAttribute("data-state", state);

  // Update icon visibility
  iconMic.style.display = "none";
  iconProcessing.style.display = "none";
  waveformEl.style.display = "none";

  switch (state) {
    case "idle":
      iconMic.style.display = "block";
      statusLabel.textContent = "Click to start";
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
      // Auto-recover after 3s
      setTimeout(() => setState("idle"), 3000);
      break;
  }
}

// ── Voice Interaction ──────────────────────

function toggleListening() {
  if (currentState === "listening") {
    stopListening();
  } else if (currentState === "speaking") {
    // Stop TTS and start listening
    stopSpeaking();
    startListening();
  } else {
    startListening();
  }
}

function startListening() {
  // Initialize Web Speech API
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    addMessage("Speech recognition not supported in this browser.", "status");
    setState("error");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let finalTranscript = "";
  let interimTranscript = "";

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    finalTranscript = "";
    interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    // Show interim results
    if (interimTranscript) {
      updateInterimMessage(interimTranscript);
    }

    // Reset silence timeout
    if (speechTimeout) clearTimeout(speechTimeout);
    speechTimeout = setTimeout(() => {
      if (finalTranscript) {
        handleFinalSpeech(finalTranscript);
      }
    }, 1500);
  };

  recognition.onend = () => {
    if (finalTranscript && currentState === "listening") {
      handleFinalSpeech(finalTranscript);
    } else if (!finalTranscript && currentState === "listening") {
      // Restart if no result yet
      try {
        recognition?.start();
      } catch (e) {
        setState("idle");
      }
    }
    isListening = false;
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    console.error("[VoicePilot] Recognition error:", event.error);
    if (event.error !== "aborted" && event.error !== "no-speech") {
      addMessage(`Mic error: ${event.error}`, "status");
      setState("error");
    }
    isListening = false;
  };

  try {
    recognition.start();
    isListening = true;
    setState("listening");
    showTranscript();
  } catch (e) {
    console.error("[VoicePilot] Failed to start recognition:", e);
    setState("error");
  }
}

function stopListening() {
  if (recognition) {
    recognition.abort();
    recognition = null;
  }
  isListening = false;
  if (currentState === "listening") {
    setState("idle");
  }
}

async function handleFinalSpeech(text: string) {
  stopListening();
  removeInterimMessage();
  addMessage(text, "user");
  setState("processing");

  try {
    // Send to background for processing
    const response = await chrome.runtime.sendMessage({
      type: MSG.SPEECH_RESULT,
      text,
    });

    if (response?.error && !response?.aiResponse) {
      addMessage(response.error, "status");
      setState("error");
      return;
    }

    const aiText = response?.aiResponse || "I couldn't process that.";
    addMessage(aiText, "assistant");

    // Speak the response using TTS
    await speakResponse(aiText);
  } catch (err) {
    console.error("[VoicePilot] Error:", err);
    addMessage("Something went wrong. Please try again.", "status");
    setState("error");
  }
}

// ── TTS Playback ───────────────────────────

async function speakResponse(text: string) {
  setState("speaking");

  try {
    // Try ElevenLabs via background
    const settings = await chrome.runtime.sendMessage({
      type: MSG.GET_SETTINGS,
    });

    if (settings?.elevenlabsKey) {
      await speakWithElevenLabs(text, settings);
    } else {
      // Fallback to browser TTS
      await speakWithBrowserTTS(text);
    }
  } catch (err) {
    console.warn("[VoicePilot] TTS error, falling back:", err);
    await speakWithBrowserTTS(text);
  }

  setState("idle");
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
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  };
  if (settings.proxyUrl) body.voice_id = voiceId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

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
    ttsAudio = null;
  }
  speechSynthesis.cancel();
}

// ── Transcript UI ──────────────────────────

function showTranscript() {
  transcriptPanel.classList.add("visible");
}

function hideTranscript() {
  transcriptPanel.classList.remove("visible");
}

function addMessage(text: string, type: "user" | "assistant" | "status") {
  const el = document.createElement("div");
  el.className = `transcript-message ${type}`;
  el.textContent = text;
  transcriptMessages.appendChild(el);
  transcriptPanel.scrollTop = transcriptPanel.scrollHeight;

  // Keep max 20 messages
  while (transcriptMessages.children.length > 20) {
    transcriptMessages.removeChild(transcriptMessages.firstChild!);
  }

  showTranscript();

  // Auto-hide after inactivity
  if (type === "assistant") {
    setTimeout(() => {
      if (currentState === "idle") hideTranscript();
    }, 8000);
  }
}

let interimEl: HTMLElement | null = null;

function updateInterimMessage(text: string) {
  if (!interimEl) {
    interimEl = document.createElement("div");
    interimEl.className = "transcript-message status";
    transcriptMessages.appendChild(interimEl);
  }
  interimEl.textContent = text;
  transcriptPanel.scrollTop = transcriptPanel.scrollHeight;
}

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
      const height = 6 + Math.random() * 18;
      bar.style.height = `${height}px`;
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

  switch (event.data.type) {
    case "voicepilot:state_update":
      if (event.data.state) setState(event.data.state as OrbState);
      if (event.data.text) addMessage(event.data.text, "assistant");
      if (event.data.userText) addMessage(event.data.userText, "user");
      break;
  }
}

// ── Start ──────────────────────────────────
init();
