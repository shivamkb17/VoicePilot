# Chrome Web Store Data Disclosure Mapping (VoicePilot)

Last updated: 2026-05-09

This document helps map VoicePilot behavior to Chrome Web Store privacy form answers. Final answers must reflect the exact shipped build.

## Data Types Potentially Processed

1. Audio data
   - Microphone input used for speech features.
2. Website content
   - Page context extracted from the active website (URL/title/headings/text snippets and similar structure).
3. User-provided credentials/settings
   - API keys, proxy URL, voice ID, feature toggles stored in local extension storage.
4. User communications
   - Voice commands/transcripts and AI responses during runtime sessions.

## Purpose of Use

- Core functionality (voice navigation, summarization, AI responses).
- Not for advertising.
- Not for data brokering.

## Storage and Transfer

- Local extension storage: `chrome.storage.local`.
- Runtime memory for session context.
- Third-party transfer occurs only to services configured by the user for requested features (OpenAI, ElevenLabs, Firecrawl, or user proxy).

## Developer Collection Statement

- No default centralized VoicePilot backend collection is intended in the BYO-key model.
- If a developer backend is added in future, CWS disclosures and policy must be updated before release.

## Data Sale / Sharing

- No sale of user data.
- Data sharing is limited to service providers necessary for requested user features.

## Required Release Checks Before Submission

- Remove any hardcoded real API keys from code and release bundle.
- Ensure privacy policy URL in Chrome Web Store points to a publicly hosted version of `PRIVACY_POLICY.md`.
- Ensure CWS data disclosure answers exactly match the final build behavior.
- Ensure affiliate links are transparently disclosed in listing or policy.
