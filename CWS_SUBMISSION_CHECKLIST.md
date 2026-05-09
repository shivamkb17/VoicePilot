# Chrome Web Store Submission Checklist (VoicePilot)

Use this before every production upload.

## Blockers (must pass)

- [ ] No real API keys in source, defaults, docs examples, or packaged `dist/`.
- [ ] Extension builds successfully (`npm run build`) with no TS errors.
- [ ] `manifest.json` points to built JS outputs in packaged extension (no raw `.ts` references in final artifact).
- [ ] Privacy policy is publicly hosted and linked in CWS listing.
- [ ] CWS "Data usage" form matches actual shipped behavior.
- [ ] Permissions are minimum necessary for shipped features.

## Privacy and disclosures

- [ ] BYO API key model clearly explained in store listing.
- [ ] Third-party processing (OpenAI/ElevenLabs/Firecrawl/proxy) disclosed.
- [ ] Affiliate links disclosed in listing or policy.
- [ ] Clear statement whether developer backend collects any content (default: no).

## Store listing quality

- [ ] Accurate short and full description (no misleading claims).
- [ ] Screenshots reflect real current extension UI.
- [ ] Support contact and privacy policy URL are valid.
- [ ] Version in listing matches extension version.

## Internal release hygiene

- [ ] Rotate/revoke any previously exposed development keys before release.
- [ ] Test install from clean profile (new Chrome user) and verify first-run behavior.
- [ ] Confirm extension works when user enters their own keys from settings.
