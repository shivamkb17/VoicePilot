// ─────────────────────────────────────────────
// VoicePilot — Overlay App Controller
// Wake-word activation: "Hey Pilot" / "Hi Pilot"
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
let isMicActive = false; // Whether the mic session is running
let isWakeWordMode = true; // true = passive listening for wake word
let speechTimeout: ReturnType<typeof setTimeout> | null = null;
let waveformInterval: ReturnType<typeof setInterval> | null = null;
let ttsAudio: HTMLAudioElement | null = null;
let transcriptHideTimer: ReturnType<typeof setTimeout> | null = null;

// Wake word patterns
const WAKE_WORDS = ["hey pilot", "hi pilot", "hey, pilot", "hi, pilot", "a pilot", "hey pilots", "hey pylot"];

// ── Initialize ─────────────────────────────

function init() {
  voiceOrb.addEventListener("click", handleOrbClick);
  voiceOrb.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOrbClick();
    }
  });

  // Listen for state updates from content script
  window.addEventListener("message", handleParentMessage);

  console.log("[VoicePilot] Overlay initialized. Click orb to enable mic.");
  setState("idle");
}

// ── Notify Parent to Resize ────────────────

function requestResize(expanded: boolean) {
  window.parent.postMessage(
    { type: "voicepilot:resize", expanded },
    "*"
  );
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
      statusLabel.textContent = isMicActive ? "" : "Click to enable mic";
      orbWrapper.classList.remove("active");
      stopWaveformAnimation();
      break;

    case "listening":
      iconMic.style.display = "block";
      if (isWakeWordMode) {
        statusLabel.textContent = 'Say "Hey Pilot"';
      } else {
        statusLabel.textContent = "Listening...";
      }
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
        if (isMicActive) {
          startPassiveListening();
        } else {
          setState("idle");
        }
      }, 3000);
      break;
  }
}

// ── Orb Click Handler ──────────────────────

function handleOrbClick() {
  if (currentState === "speaking") {
    // Stop TTS and go back to passive listening
    stopSpeaking();
    startPassiveListening();
    return;
  }

  if (isMicActive) {
    // Mic is active → disable it
    stopAllListening();
    isMicActive = false;
    setState("idle");
    hideTranscript();
    requestResize(false);
    addMessage("Mic disabled. Click the orb to re-enable.", "status");
  } else {
    // Mic is off → enable it and start passive listening
    isMicActive = true;
    addMessage('Mic enabled! Say "Hey Pilot" followed by your command.', "status");
    showTranscript();
    requestResize(true);
    startPassiveListening();

    // Auto-collapse transcript after showing the welcome message
    scheduleTranscriptHide(6000);
  }
}

// ── Wake Word Detection ────────────────────

/**
 * Start passive listening — continuously listens for the wake word.
 * Uses Web Speech API with continuous=true.
 */
function startPassiveListening() {
  stopAllListening();
  isWakeWordMode = true;
  setState("listening");

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    addMessage("Speech recognition not supported in this browser.", "status");
    setState("error");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 3;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    // Process only the latest results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript.toLowerCase().trim();

      if (result.isFinal) {
        console.log("[VoicePilot] Final transcript:", transcript);
        const command = extractCommandAfterWakeWord(transcript);

        if (command !== null) {
          // Wake word detected!
          if (command.length > 0) {
            // "Hey Pilot, summarize this page" → process "summarize this page"
            handleActivatedCommand(command);
          } else {
            // Just "Hey Pilot" with nothing after → switch to active listening
            startActiveListening();
          }
          return;
        }
        // Not a wake word → ignore, keep listening
      } else {
        // Interim result — check if wake word is being spoken
        const hasWakeWord = WAKE_WORDS.some((w) => transcript.includes(w));
        if (hasWakeWord) {
          // Show visual feedback that wake word is detected
          statusLabel.textContent = "I hear you...";
        }
      }
    }
  };

  recognition.onend = () => {
    // Auto-restart passive listening if mic is still active
    if (isMicActive && isWakeWordMode) {
      console.log("[VoicePilot] Restarting passive listening...");
      setTimeout(() => {
        if (isMicActive && isWakeWordMode) {
          try {
            recognition?.start();
          } catch (e) {
            // If start fails, recreate recognition
            startPassiveListening();
          }
        }
      }, 200);
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    console.warn("[VoicePilot] Recognition error:", event.error);

    if (event.error === "not-allowed") {
      addMessage("Microphone access denied. Please allow mic access in browser settings.", "status");
      isMicActive = false;
      setState("error");
      return;
    }

    // For other errors, auto-restart
    if (event.error !== "aborted" && isMicActive) {
      setTimeout(() => {
        if (isMicActive) startPassiveListening();
      }, 1000);
    }
  };

  try {
    recognition.start();
    console.log("[VoicePilot] Passive listening started (wake word mode).");
  } catch (e) {
    console.error("[VoicePilot] Failed to start recognition:", e);
    setState("error");
  }
}

/**
 * Extract the command after the wake word, or null if no wake word found.
 */
function extractCommandAfterWakeWord(transcript: string): string | null {
  const lower = transcript.toLowerCase().trim();

  for (const wake of WAKE_WORDS) {
    const idx = lower.indexOf(wake);
    if (idx !== -1) {
      // Get everything after the wake word
      const afterWake = transcript.slice(idx + wake.length).trim();
      // Remove leading punctuation/comma
      return afterWake.replace(/^[,.\s]+/, "").trim();
    }
  }

  return null; // No wake word found
}

/**
 * Start active listening — the user already said "Hey Pilot" but no command.
 * Listen for the next utterance as the command.
 */
function startActiveListening() {
  stopAllListening();
  isWakeWordMode = false;
  setState("listening");
  statusLabel.textContent = "Listening...";

  // Show transcript panel
  showTranscript();
  requestResize(true);
  addMessage("Yes? I'm listening...", "status");

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let finalTranscript = "";

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    finalTranscript = "";
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (interimTranscript) {
      updateInterimMessage(interimTranscript);
    }

    if (finalTranscript) {
      // Clear any silence timer
      if (speechTimeout) clearTimeout(speechTimeout);
      speechTimeout = setTimeout(() => {
        if (finalTranscript.trim()) {
          handleActivatedCommand(finalTranscript.trim());
        }
      }, 1000);
    }
  };

  recognition.onend = () => {
    if (finalTranscript.trim()) {
      handleActivatedCommand(finalTranscript.trim());
    } else if (isMicActive) {
      // No command spoken — go back to passive
      addMessage("I didn't hear a command. Say \"Hey Pilot\" again when ready.", "status");
      startPassiveListening();
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "no-speech") {
      addMessage('No speech detected. Say "Hey Pilot" again.', "status");
      startPassiveListening();
      return;
    }
    console.error("[VoicePilot] Active listening error:", event.error);
    if (isMicActive) startPassiveListening();
  };

  try {
    recognition.start();
  } catch (e) {
    console.error("[VoicePilot] Failed to start active listening:", e);
    startPassiveListening();
  }
}

// ── Command Processing ─────────────────────

async function handleActivatedCommand(text: string) {
  stopAllListening();
  removeInterimMessage();

  // Show transcript
  showTranscript();
  requestResize(true);

  addMessage(text, "user");
  setState("processing");

  try {
    // Send to background service worker for AI processing
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

    // Speak the response
    await speakResponse(aiText);
  } catch (err) {
    console.error("[VoicePilot] Command error:", err);
    addMessage("Something went wrong. Please try again.", "status");
    setState("error");
  }
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
    } catch (e) {
      // Silent fallback
    }
  }

  // After speaking, go back to passive listening
  if (isMicActive) {
    scheduleTranscriptHide(5000);
    startPassiveListening();
  } else {
    setState("idle");
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
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
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
}

// ── Cleanup ────────────────────────────────

function stopAllListening() {
  if (recognition) {
    try {
      recognition.abort();
    } catch (e) {
      // Ignore
    }
    recognition = null;
  }
  if (speechTimeout) {
    clearTimeout(speechTimeout);
    speechTimeout = null;
  }
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
  // Only collapse if we're in passive listening or idle
  if (isWakeWordMode || !isMicActive) {
    requestResize(false);
  }
}

function scheduleTranscriptHide(ms: number) {
  if (transcriptHideTimer) clearTimeout(transcriptHideTimer);
  transcriptHideTimer = setTimeout(() => {
    if (currentState === "listening" && isWakeWordMode) {
      hideTranscript();
    }
  }, ms);
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
