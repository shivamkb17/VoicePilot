# VoicePilot Privacy Policy

Last updated: 2026-05-09

## 1) Overview

VoicePilot is a Chrome extension that helps users navigate and understand web pages using voice.

VoicePilot follows a bring-your-own-key model: users provide their own API keys for third-party AI providers (for example OpenAI, ElevenLabs, and optional Firecrawl).

## 2) Data Controller Statement

By default, the VoicePilot developer does not operate a central backend that collects extension conversation logs, page content, or microphone recordings from users.

Data is processed:

- locally in the user's browser; and
- by third-party providers selected and configured by the user through their own API keys; or
- by a proxy endpoint explicitly configured by the user.

## 3) Data Processed by the Extension

Depending on enabled features and user actions, the extension may process:

- Microphone audio (for speech-to-text)
- Voice commands/transcripts
- AI-generated responses
- Current page context (such as URL, title, headings, text snippets, buttons, links, forms)
- User settings (API keys, voice ID, proxy URL, feature toggles)

## 4) Where Data Is Stored

- Extension settings are stored in `chrome.storage.local` in the user's browser profile.
- Conversation state may be kept in temporary in-memory runtime state for session functionality.
- VoicePilot does not intentionally store user content on a developer-managed server by default.

## 5) Third-Party Processing

When users trigger AI or voice features, relevant data may be transmitted to third-party APIs configured by the user, such as:

- OpenAI (chat/intents)
- ElevenLabs (speech-to-text/text-to-speech)
- Firecrawl (optional page scraping)
- A user-configured proxy URL

These services process data under their own privacy terms. Users are responsible for reviewing those provider policies before use.

## 6) Affiliate Links

VoicePilot may provide provider signup links that include affiliate parameters in the extension UI or documentation.

- These links are intended to help cover product costs.
- Affiliate link usage does not change how extension runtime data is processed.
- Users can still supply any compatible provider credentials regardless of affiliate signup.

## 7) Permissions and Access

VoicePilot may request permissions required for extension features, including page interaction and local storage.

Users can disable or uninstall the extension at any time via Chrome extension settings.

## 8) Data Sharing and Selling

VoicePilot developer does not sell user personal data collected via a central backend because, by default, no central backend collection is performed.

## 9) Security

Reasonable efforts are made to reduce data exposure risk. Users should:

- keep API keys private,
- rotate keys periodically, and
- remove/revoke keys they no longer use.

## 10) Children's Privacy

VoicePilot is not intended for children under 13.

## 11) Changes to This Policy

This policy may be updated over time. Updated versions will include a revised "Last updated" date.

## 12) Contact

For privacy questions, contact the developer through the support channel listed in the Chrome Web Store listing.
