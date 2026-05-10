// ─────────────────────────────────────────────
// VoicePilot — ElevenLabs Voice I/O Service
// Handles Text-to-Speech playback
// ─────────────────────────────────────────────

/**
 * Convert text to speech using ElevenLabs API and play it
 */
export async function speakText(
  text: string,
  apiKey: string,
  voiceId: string,
  proxyUrl?: string
): Promise<void> {
  const url = proxyUrl
    ? `${proxyUrl}/api/tts`
    : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!proxyUrl) {
    headers["xi-api-key"] = apiKey;
  } else {
    headers["X-API-Key"] = apiKey;
  }

  const body: Record<string, unknown> = {
    text,
    model_id: "eleven_turbo_v2_5",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
  };

  // Include voiceId in body when using proxy
  if (proxyUrl) {
    body.voice_id = voiceId;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs TTS error: ${response.status} — ${error}`);
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      resolve();
    };
    audio.onerror = (err) => {
      URL.revokeObjectURL(audioUrl);
      reject(err);
    };
    audio.play().catch(reject);
  });
}

/**
 * Create a speech recognition instance using the Web Speech API
 * (Used as primary STT — ElevenLabs STT can be added later)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSpeechRecognition(): any {
  const SR =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SR) {
    console.error("[VoicePilot] Speech recognition not supported in this browser.");
    return null;
  }

  const recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  return recognition;
}
