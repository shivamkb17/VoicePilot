// ─────────────────────────────────────────────
// VoicePilot — Overlay App Controller
// ElevenLabs Scribe v2 STT + silence detection
// Always-listening with 30-min wake word gate
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
let lastActivityTime: number = Date.now();
let isProcessingCommand = false;

// Audio recording state
let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let volumeCheckInterval: ReturnType<typeof setInterval> | null = null;
let isRecording = false;
let hasSpeechStarted = false;

// Config
const INACTIVITY_THRESHOLD = 30 * 60 * 1000; // 30 min
const SILENCE_DURATION = 1500; // 1.5s of silence = end of utterance
const SILENCE_THRESHOLD = 15; // Volume threshold (0-255)
const MIN_RECORDING_MS = 500; // Minimum recording length to send
const WAKE_WORDS = [
  "hey pilot", "hi pilot", "hey, pilot", "hi, pilot",
  "a pilot", "hey pilots", "hey pylot",
];

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

  console.log("[VoicePilot] Overlay initialized (ElevenLabs Scribe v2 STT).");
  setState("idle");
}

// ── Notify Parent to Resize ────────────────

function requestResize(expanded: boolean) {
  window.parent.postMessage({ type: "voicepilot:resize", expanded }, "*");
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
      if (isInactive()) {
        statusLabel.textContent = 'Say "Hey Pilot" to wake up';
      } else {
        statusLabel.textContent = "Listening...";
      }
      orbWrapper.classList.add("active");
      stopWaveformAnimation();
      break;

    case "processing":
      iconProcessing.style.display = "block";
      statusLabel.textContent = "Transcribing...";
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
        if (isMicActive) startListening();
        else setState("idle");
      }, 3000);
      break;
  }
}

// ── Helpers ────────────────────────────────

function isInactive(): boolean {
  return Date.now() - lastActivityTime > INACTIVITY_THRESHOLD;
}

function markActive() {
  lastActivityTime = Date.now();
}

// ── Orb Click Handler ──────────────────────

function handleOrbClick() {
  if (currentState === "speaking") {
    stopSpeaking();
    startListening();
    return;
  }

  if (isMicActive) {
    stopAllAudio();
    isMicActive = false;
    isProcessingCommand = false;
    setState("idle");
    hideTranscript();
    requestResize(false);
  } else {
    isMicActive = true;
    markActive();
    addMessage("🎤 Mic enabled! Just speak — I'm always listening.", "status");
    showTranscript();
    requestResize(true);
    startListening();
    scheduleTranscriptHide(5000);
  }
}

// ── Microphone + Silence Detection ─────────

async function startListening() {
  stopAllAudio();
  isProcessingCommand = false;
  setState("listening");

  try {
    // Get microphone access
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });

    // Set up AudioContext for volume monitoring
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512;
    source.connect(analyserNode);

    // Start recording
    startRecording();

    // Start volume monitoring for silence detection
    startVolumeMonitoring();

    console.log("[VoicePilot] Mic active — listening with ElevenLabs Scribe v2.");
  } catch (err: any) {
    console.error("[VoicePilot] Mic access error:", err);
    if (err.name === "NotAllowedError") {
      addMessage("Mic access denied. Please allow microphone in browser settings.", "status");
    } else {
      addMessage("Could not access microphone: " + err.message, "status");
    }
    isMicActive = false;
    setState("error");
  }
}

function startRecording() {
  if (!mediaStream) return;

  audioChunks = [];
  hasSpeechStarted = false;

  // Use webm/opus for good quality + small size
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  mediaRecorder = new MediaRecorder(mediaStream, {
    mimeType,
    audioBitsPerSecond: 64000,
  });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    // Recording stopped — process the audio
    if (audioChunks.length > 0 && hasSpeechStarted) {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      if (audioBlob.size > 1000) {
        // Big enough to contain speech
        transcribeAudio(audioBlob);
      } else {
        // Too small — restart
        if (isMicActive && !isProcessingCommand) startRecording();
      }
    } else {
      // No speech detected — restart
      if (isMicActive && !isProcessingCommand) startRecording();
    }
  };

  mediaRecorder.start(250); // Collect in 250ms chunks
  isRecording = true;
}

function startVolumeMonitoring() {
  if (!analyserNode) return;

  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let recordingStartTime = Date.now();

  volumeCheckInterval = setInterval(() => {
    if (!analyserNode || !isRecording) return;

    analyserNode.getByteFrequencyData(dataArray);

    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
    const avgVolume = sum / bufferLength;

    if (avgVolume > SILENCE_THRESHOLD) {
      // Speech detected
      if (!hasSpeechStarted) {
        hasSpeechStarted = true;
        recordingStartTime = Date.now();
        updateInterimMessage("🎤 Hearing you...");
        showTranscript();
        requestResize(true);
      }

      // Reset silence timer
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    } else if (hasSpeechStarted) {
      // Silence after speech — start timer
      if (!silenceTimer) {
        const elapsed = Date.now() - recordingStartTime;
        if (elapsed > MIN_RECORDING_MS) {
          silenceTimer = setTimeout(() => {
            // Silence long enough — stop recording and transcribe
            console.log("[VoicePilot] Silence detected, transcribing...");
            stopRecordingForTranscription();
          }, SILENCE_DURATION);
        }
      }
    }
  }, 100);
}

function stopRecordingForTranscription() {
  isRecording = false;

  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }

  if (volumeCheckInterval) {
    clearInterval(volumeCheckInterval);
    volumeCheckInterval = null;
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop(); // Triggers onstop → transcribeAudio
  }
}

// ── ElevenLabs Scribe v2 Transcription ─────

async function transcribeAudio(audioBlob: Blob) {
  if (isProcessingCommand) return;
  isProcessingCommand = true;

  removeInterimMessage();
  updateInterimMessage("Transcribing with ElevenLabs...");
  setState("processing");

  try {
    // Get API key
    const settings = await chrome.runtime.sendMessage({
      type: MSG.GET_SETTINGS,
    });

    const apiKey = settings?.elevenlabsKey;
    if (!apiKey) {
      addMessage("No ElevenLabs API key configured.", "status");
      isProcessingCommand = false;
      startListening();
      return;
    }

    // Build form data for ElevenLabs STT
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");
    formData.append("model_id", "scribe_v2");
    formData.append("language_code", "en");
    formData.append("tag_audio_events", "false");
    formData.append("diarize", "false");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`STT error ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const transcript = result.text?.trim() || "";

    console.log("[VoicePilot] Scribe v2 transcript:", transcript);

    if (!transcript || transcript.length < 2) {
      removeInterimMessage();
      isProcessingCommand = false;
      startListening();
      return;
    }

    removeInterimMessage();

    // Check for wake word if inactive
    if (isInactive()) {
      const command = extractAfterWakeWord(transcript);
      if (command !== null) {
        markActive();
        if (command.length > 0) {
          await processCommand(command);
        } else {
          addMessage("I'm awake! What can I help you with?", "status");
          showTranscript();
          requestResize(true);
          isProcessingCommand = false;
          startListening();
          scheduleTranscriptHide(5000);
        }
      } else {
        // No wake word — ignore
        isProcessingCommand = false;
        startListening();
      }
      return;
    }

    // Normal mode — process the transcript
    markActive();
    await processCommand(transcript);
  } catch (err: any) {
    console.error("[VoicePilot] STT error:", err);
    removeInterimMessage();

    if (err.name === "AbortError") {
      addMessage("Transcription timed out. Try again.", "status");
    } else {
      addMessage("Transcription error: " + err.message, "status");
    }

    isProcessingCommand = false;
    if (isMicActive) startListening();
  }
}

function extractAfterWakeWord(transcript: string): string | null {
  const lower = transcript.toLowerCase().trim();
  for (const wake of WAKE_WORDS) {
    const idx = lower.indexOf(wake);
    if (idx !== -1) {
      return transcript.slice(idx + wake.length).replace(/^[,.\s]+/, "").trim();
    }
  }
  return null;
}

// ── Command Processing ─────────────────────

async function processCommand(text: string) {
  showTranscript();
  requestResize(true);
  addMessage(text, "user");
  setState("processing");
  statusLabel.textContent = "Thinking...";

  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG.SPEECH_RESULT,
      text,
    });

    if (response?.error && !response?.aiResponse) {
      addMessage(response.error, "status");
      setState("error");
      isProcessingCommand = false;
      restartListening();
      return;
    }

    const aiText = response?.aiResponse || "I couldn't process that.";
    addMessage(aiText, "assistant");
    await speakResponse(aiText);
  } catch (err) {
    console.error("[VoicePilot] Command error:", err);
    addMessage("Something went wrong. Please try again.", "status");
    setState("error");
    isProcessingCommand = false;
    restartListening();
  }
}

function restartListening() {
  if (isMicActive) {
    setTimeout(() => {
      isProcessingCommand = false;
      startListening();
      scheduleTranscriptHide(6000);
    }, 800);
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
    } catch (e) { /* silent */ }
  }

  isProcessingCommand = false;
  restartListening();
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
}

// ── Cleanup ────────────────────────────────

function stopAllAudio() {
  // Stop recording
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try { mediaRecorder.stop(); } catch (e) { /* ignore */ }
  }
  mediaRecorder = null;
  isRecording = false;
  hasSpeechStarted = false;
  audioChunks = [];

  // Stop timers
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
  if (volumeCheckInterval) { clearInterval(volumeCheckInterval); volumeCheckInterval = null; }

  // Stop mic stream
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }

  // Close audio context
  if (audioContext && audioContext.state !== "closed") {
    audioContext.close().catch(() => {});
    audioContext = null;
    analyserNode = null;
  }

  // Stop TTS
  stopSpeaking();
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
  if (interimEl) { interimEl.remove(); interimEl = null; }
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
  if (waveformInterval) { clearInterval(waveformInterval); waveformInterval = null; }
  waveformBars.forEach((bar) => { bar.style.height = "8px"; });
}

// ── Parent Message Handler ─────────────────

function handleParentMessage(event: MessageEvent) {
  if (!event.data?.type?.startsWith("voicepilot:")) return;
  if (event.data.type === "voicepilot:state_update") {
    if (event.data.state) setState(event.data.state as OrbState);
    if (event.data.text) addMessage(event.data.text, "assistant");
    if (event.data.userText) addMessage(event.data.userText, "user");
  }
}

// ── Start ──────────────────────────────────
init();
