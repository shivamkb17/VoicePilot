// ─────────────────────────────────────────────
// VoicePilot — Offscreen document: microphone + STT
// Runs outside embedded page Permissions Policy (e.g. Facebook).
// ─────────────────────────────────────────────

import { MSG } from "../utils/constants";

let sessionTabId: number | null = null;
let isMicActive = false;
let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let volumeCheckInterval: ReturnType<typeof setInterval> | null = null;
let isRecording = false;
let hasSpeechStarted = false;
/** True while STT or AI+TTS pipeline owns the loop (until RECORDER_RESUME). */
let pipelineBusy = false;

let lastActivityTime: number = Date.now();

const INACTIVITY_THRESHOLD = 30 * 60 * 1000;
const SILENCE_DURATION = 1500;
const SILENCE_THRESHOLD = 15;
const MIN_RECORDING_MS = 500;
const WAKE_WORDS = [
  "hey pilot",
  "hi pilot",
  "hey, pilot",
  "hi, pilot",
  "a pilot",
  "hey pilots",
  "hey pylot",
];

function isInactive(): boolean {
  return Date.now() - lastActivityTime > INACTIVITY_THRESHOLD;
}

function markActive() {
  lastActivityTime = Date.now();
}

type RecorderEmitKind =
  | "mic_ready"
  | "mic_error"
  | "phase"
  | "notify"
  | "pipeline_text";

function emitRecorder(
  kind: RecorderEmitKind,
  tabId: number,
  extra?: { phase?: string; text?: string; level?: "status" | "error" }
) {
  chrome.runtime.sendMessage({
    type: MSG.RECORDER_EVENT,
    tabId,
    kind,
    ...extra,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MSG.RECORDER_START) {
    const tabId = message.tabId as number;
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, error: "missing_tabId" });
      return false;
    }
    void startSessionForTab(tabId).then(
      () => sendResponse({ ok: true }),
      (e) =>
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        })
    );
    return true;
  }

  if (message.type === MSG.RECORDER_STOP) {
    const tabId = message.tabId as number | undefined;
    if (tabId !== undefined && sessionTabId !== null && tabId !== sessionTabId) {
      sendResponse({ ok: true });
      return false;
    }
    void stopSession().then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: true })
    );
    return true;
  }

  if (message.type === MSG.RECORDER_RESUME) {
    const tabId = message.tabId as number;
    if (typeof tabId !== "number") {
      sendResponse({ ok: false });
      return false;
    }
    void resumeAfterPipeline(tabId).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: true })
    );
    return true;
  }

  return false;
});

async function startSessionForTab(tabId: number) {
  if (sessionTabId !== null && sessionTabId !== tabId) {
    await stopSession();
  }
  sessionTabId = tabId;
  isMicActive = true;
  pipelineBusy = false;
  markActive();
  await startListening(tabId);
}

async function stopSession() {
  isMicActive = false;
  pipelineBusy = false;
  stopAllAudio();
  const tid = sessionTabId;
  sessionTabId = null;
  if (tid !== null) {
    emitRecorder("phase", tid, { phase: "idle" });
  }
}

async function startListening(tabId: number) {
  if (sessionTabId !== tabId) return;

  stopAllAudio();
  pipelineBusy = false;
  emitRecorder("phase", tabId, { phase: "listening" });

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512;
    source.connect(analyserNode);

    emitRecorder("mic_ready", tabId);
    startRecording(tabId);
    startVolumeMonitoring(tabId);

    console.log("[VoicePilot Offscreen] Mic active.");
  } catch (err: unknown) {
    console.error("[VoicePilot Offscreen] Mic access error:", err);
    const message =
      err instanceof DOMException && err.name === "NotAllowedError"
        ? "Mic access denied. Allow microphone for the VoicePilot extension in browser settings."
        : `Could not access microphone: ${err instanceof Error ? err.message : String(err)}`;
    emitRecorder("mic_error", tabId, { text: message, level: "error" });
    isMicActive = false;
    emitRecorder("phase", tabId, { phase: "error" });
  }
}

function startRecording(tabId: number) {
  if (!mediaStream || sessionTabId !== tabId) return;

  audioChunks = [];
  hasSpeechStarted = false;

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
    if (!isMicActive || sessionTabId !== tabId || pipelineBusy) return;

    if (audioChunks.length > 0 && hasSpeechStarted) {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      if (audioBlob.size > 1000) {
        void transcribeAudio(audioBlob, tabId);
      } else {
        if (isMicActive && !pipelineBusy) startRecording(tabId);
      }
    } else {
      if (isMicActive && !pipelineBusy) startRecording(tabId);
    }
  };

  mediaRecorder.start(250);
  isRecording = true;
}

function startVolumeMonitoring(tabId: number) {
  if (!analyserNode) return;

  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let recordingStartTime = Date.now();

  volumeCheckInterval = setInterval(() => {
    if (!analyserNode || !isRecording || sessionTabId !== tabId || pipelineBusy) return;

    analyserNode.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
    const avgVolume = sum / bufferLength;

    if (avgVolume > SILENCE_THRESHOLD) {
      if (!hasSpeechStarted) {
        hasSpeechStarted = true;
        recordingStartTime = Date.now();
        emitRecorder("notify", tabId, { text: "🎤 Hearing you...", level: "status" });
      }

      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    } else if (hasSpeechStarted) {
      if (!silenceTimer) {
        const elapsed = Date.now() - recordingStartTime;
        if (elapsed > MIN_RECORDING_MS) {
          silenceTimer = setTimeout(() => {
            console.log("[VoicePilot Offscreen] Silence detected, transcribing...");
            stopRecordingForTranscription(tabId);
          }, SILENCE_DURATION);
        }
      }
    }
  }, 100);
}

function stopRecordingForTranscription(tabId: number) {
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
    mediaRecorder.stop();
  }
}

async function transcribeAudio(audioBlob: Blob, tabId: number) {
  if (!isMicActive || sessionTabId !== tabId) return;

  pipelineBusy = true;

  emitRecorder("notify", tabId, { text: "Transcribing with ElevenLabs...", level: "status" });
  emitRecorder("phase", tabId, { phase: "processing" });

  try {
    const settings = await chrome.runtime.sendMessage({
      type: MSG.GET_SETTINGS,
    });

    const apiKey = settings?.elevenlabsKey;
    if (!apiKey) {
      emitRecorder("notify", tabId, {
        text: "No ElevenLabs API key configured.",
        level: "status",
      });
      pipelineBusy = false;
      if (isMicActive && sessionTabId === tabId) await recoverListeningAfterError(tabId);
      return;
    }

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

    const result = (await response.json()) as { text?: string };
    const transcript = result.text?.trim() || "";

    console.log("[VoicePilot Offscreen] Scribe v2 transcript:", transcript);

    if (!transcript || transcript.length < 2) {
      pipelineBusy = false;
      if (isMicActive && sessionTabId === tabId) await recoverListeningAfterError(tabId);
      return;
    }

    if (isInactive()) {
      const command = extractAfterWakeWord(transcript);
      if (command !== null) {
        markActive();
        if (command.length > 0) {
          emitRecorder("pipeline_text", tabId, { text: command });
          return;
        }
        emitRecorder("notify", tabId, {
          text: "I'm awake! What can I help you with?",
          level: "status",
        });
        pipelineBusy = false;
        if (isMicActive && sessionTabId === tabId) await recoverListeningAfterError(tabId);
        return;
      }
      pipelineBusy = false;
      if (isMicActive && sessionTabId === tabId) await recoverListeningAfterError(tabId);
      return;
    }

    markActive();
    emitRecorder("pipeline_text", tabId, { text: transcript });
  } catch (err: unknown) {
    console.error("[VoicePilot Offscreen] STT error:", err);
    const msg =
      err instanceof Error && err.name === "AbortError"
        ? "Transcription timed out. Try again."
        : `Transcription error: ${err instanceof Error ? err.message : String(err)}`;
    emitRecorder("notify", tabId, { text: msg, level: "status" });
    pipelineBusy = false;
    if (isMicActive && sessionTabId === tabId) await recoverListeningAfterError(tabId);
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

/** After STT error / empty / wake-only — restart capture loop */
async function recoverListeningAfterError(tabId: number) {
  if (!isMicActive || sessionTabId !== tabId) return;
  stopTracksOnly();
  emitRecorder("phase", tabId, { phase: "listening" });
  await startListening(tabId);
}

/** Release mic tracks but keep session flags so startListening can re-acquire */
function stopTracksOnly() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch {
      /* ignore */
    }
  }
  mediaRecorder = null;
  isRecording = false;
  hasSpeechStarted = false;
  audioChunks = [];

  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  if (volumeCheckInterval) {
    clearInterval(volumeCheckInterval);
    volumeCheckInterval = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }

  if (audioContext && audioContext.state !== "closed") {
    audioContext.close().catch(() => {});
    audioContext = null;
    analyserNode = null;
  }
}

async function resumeAfterPipeline(tabId: number) {
  if (!isMicActive || sessionTabId !== tabId) return;

  pipelineBusy = false;
  emitRecorder("phase", tabId, { phase: "listening" });

  if (!mediaStream) {
    await startListening(tabId);
    return;
  }

  startRecording(tabId);
  startVolumeMonitoring(tabId);
}

function stopAllAudio() {
  pipelineBusy = false;
  stopTracksOnly();
}

console.log("[VoicePilot Offscreen] Recorder module loaded.");
