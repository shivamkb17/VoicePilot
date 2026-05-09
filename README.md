<p align="center">
  <img src="src/icons/icon128.png" alt="VoicePilot Logo" width="100" />
</p>

<h1 align="center">VoicePilot</h1>

<p align="center">
  <strong>A conversational accessibility layer for the internet.</strong><br/>
  Browse, understand, and navigate websites completely through voice — without touching a keyboard.
</p>

> Important for release builds: VoicePilot is designed for a bring-your-own-key model. End users must enter their own provider API keys in extension settings.

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blueviolet?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6.0-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o-412991?style=flat-square&logo=openai&logoColor=white" alt="OpenAI" />
  <img src="https://img.shields.io/badge/ElevenLabs-TTS-000000?style=flat-square" alt="ElevenLabs" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License" />
</p>

---

## 🎯 What is VoicePilot?

VoicePilot transforms your browser into a **conversational interface**. Instead of clicking through websites manually, you simply speak naturally:

| You Say | VoicePilot Does |
|---------|----------------|
| *"What is this website?"* | Analyzes the page and gives a concise summary |
| *"Find pricing"* | Scrolls to the pricing section automatically |
| *"Click Get Started"* | Finds and clicks the matching button |
| *"Summarize this page"* | Extracts key information and reads it aloud |
| *"Scroll down"* | Smoothly scrolls the page |
| *"Which plan is best for startups?"* | Analyzes pricing context and gives a recommendation |
| *"Go back"* | Navigates to the previous page |
| *"Where am I?"* | Describes the current page layout and position |

The AI understands the webpage semantically, navigates intelligently, and responds naturally using **ElevenLabs** voice synthesis.

---

## ✨ Key Features

### 🗣️ Voice Conversation System
- **Click-to-talk** interaction with the floating Voice Orb
- Real-time speech-to-text via the **Web Speech API**
- Natural voice responses via **ElevenLabs TTS** (with browser TTS fallback)
- Live subtitle transcription panel
- Multi-turn conversational memory — ask follow-up questions naturally

### 🧠 Website Understanding Engine
- **Semantic DOM extraction** — headings, sections, buttons, links, forms
- Converts any webpage into structured, AI-readable context
- Deep page scraping via **Firecrawl** for complex/SPA sites
- Page-aware AI responses powered by **GPT-4o**

### 🧭 Smart Navigation
- **Section navigation** — *"Go to pricing"* scrolls to the matching section
- **Element clicking** — *"Click Contact Sales"* finds and clicks the button
- **Scroll control** — up, down, top, bottom with smooth animations
- **History navigation** — go back / go forward
- Visual highlight feedback before clicking elements

### 🎨 Premium Glassmorphism UI
- Floating Voice Orb with **5 animated states** (idle, listening, processing, speaking, error)
- Pulsing rings during listening, waveform bars during speech
- Backdrop blur, glow effects, and smooth transitions
- Auto-hiding transcript panel with slide-in animation
- Fully isolated via iframe — zero CSS conflicts with host pages

### ♿ Accessibility-First Design
- Hands-free web browsing for users with motor disabilities
- Screen reader compatible with proper ARIA labels
- Page layout descriptions for visually impaired users
- Keyboard navigable (Enter/Space to toggle voice)

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────┐
│                 Chrome Extension                  │
│                                                   │
│  ┌─────────────┐   ┌──────────────────────────┐  │
│  │   Content    │   │    Background Service     │  │
│  │   Script     │   │       Worker              │  │
│  │             │   │                            │  │
│  │ • DOM Extract│◄──┤ • Intent Router           │  │
│  │ • Navigator  │   │ • AI Chat (OpenAI)        │  │
│  │ • Overlay    │   │ • Conversation Memory     │  │
│  │   Injection  │   │ • Settings Manager        │  │
│  └──────┬───────┘   └────────┬─────────────────┘  │
│         │                    │                     │
│  ┌──────▼───────┐           │                     │
│  │   Floating   │           │                     │
│  │   Overlay    │           │                     │
│  │   (iframe)   │           │                     │
│  │              │           │                     │
│  │ • Voice Orb  │    ┌──────▼──────────┐          │
│  │ • Transcript │    │   External APIs  │          │
│  │ • STT / TTS  │    │                  │          │
│  └──────────────┘    │ • OpenAI GPT-4o  │          │
│                      │ • ElevenLabs TTS │          │
│                      │ • Firecrawl      │          │
│                      └──────────────────┘          │
└──────────────────────────────────────────────────┘
```

### Data Flow

```
User Speech → Web Speech API (STT) → Intent Router → Action / AI Chat → ElevenLabs (TTS) → Audio Response
                                          │
                                          ├── Local Intent (scroll, back, click) → Execute immediately
                                          └── AI Intent (summarize, explain)    → GPT-4o + Page Context → Response
```

---

## 📁 Project Structure

```
VoicePilot/
├── src/
│   ├── manifest.json                # Chrome Manifest V3 configuration
│   │
│   ├── background/
│   │   └── service-worker.ts        # Central AI router, intent handling,
│   │                                #   conversation memory, settings
│   │
│   ├── content/
│   │   ├── content-script.ts        # Overlay injection, message bridge
│   │   ├── dom-extractor.ts         # DOM → structured PageContext JSON
│   │   └── navigator.ts            # Scroll, section nav, click engine
│   │
│   ├── overlay/
│   │   ├── overlay.html             # Voice Orb + transcript panel markup
│   │   └── overlay-app.ts          # STT, TTS, state machine, waveform
│   │
│   ├── popup/
│   │   ├── popup.html               # Settings page markup
│   │   ├── popup.ts                 # Settings load/save controller
│   │   └── popup.css                # Premium dark settings styles
│   │
│   ├── services/
│   │   ├── ai-chat.ts               # OpenAI GPT-4o chat completions
│   │   ├── intent-router.ts         # Local keyword + AI intent classification
│   │   ├── scraper.ts               # Firecrawl deep page scraping
│   │   └── voice-io.ts             # ElevenLabs TTS + Web Speech API STT
│   │
│   ├── utils/
│   │   ├── constants.ts             # Types, message IDs, storage keys
│   │   ├── messaging.ts            # Chrome runtime message helpers
│   │   └── storage.ts              # Settings abstraction layer
│   │
│   ├── styles/
│   │   └── overlay.css              # Glassmorphism orb, animations
│   │
│   ├── icons/                       # Extension icons (16/32/48/128px)
│   └── public/                      # Static assets copied to dist/
│
├── dist/                            # Built extension (load this in Chrome)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and **npm** 9+
- **Google Chrome** (or any Chromium-based browser)
- **API Keys** (at least one):
  - [OpenAI API Key](https://platform.openai.com/api-keys) — *required for AI chat*
  - [ElevenLabs API Key](https://elevenlabs.io/) — *optional, for premium voice*
  - [Firecrawl API Key](https://firecrawl.dev/) — *optional, for deep page scraping*

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/VoicePilot.git
cd VoicePilot

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build

# 4. For development with auto-rebuild
npm run dev
```

### Loading in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the `dist/` folder from the project directory
5. The VoicePilot icon will appear in your extensions toolbar

### Configuration

1. Click the **VoicePilot icon** in the Chrome toolbar to open Settings
2. Enter your **OpenAI API Key** (required)
3. Optionally enter your **ElevenLabs API Key** for premium voice
4. Optionally enter your **Firecrawl API Key** for deep page scraping
5. Click **Save Settings**

> **💡 Tip:** Without an ElevenLabs key, VoicePilot falls back to your browser's built-in text-to-speech, which still works great!

---

## 🎮 Usage

### Basic Interaction

1. Visit any website
2. Click the **glowing orb** in the bottom-right corner
3. Speak your command naturally
4. VoicePilot will process your request and respond with voice

### Voice Commands

#### 📖 Understanding Commands
| Command | What It Does |
|---------|-------------|
| *"What is this website?"* | Summarizes the current page |
| *"Summarize this page"* | Extracts and reads key information |
| *"Explain this product"* | Provides a detailed explanation |
| *"What does this company do?"* | Analyzes the page for company info |
| *"Describe this page"* | Describes the page layout and content |
| *"Read important sections"* | Reads through key sections |

#### 🧭 Navigation Commands
| Command | What It Does |
|---------|-------------|
| *"Find pricing"* | Scrolls to the pricing section |
| *"Go to contact"* | Navigates to the contact section |
| *"Open reviews"* | Finds and scrolls to reviews |
| *"Scroll down"* | Scrolls down by ~70% of viewport |
| *"Scroll to top"* | Scrolls to the top of the page |
| *"Go back"* | Navigates to the previous page |

#### 🖱️ Interaction Commands
| Command | What It Does |
|---------|-------------|
| *"Click Get Started"* | Finds and clicks the "Get Started" button |
| *"Press Sign Up"* | Clicks the sign-up button |
| *"Click Contact Sales"* | Clicks the "Contact Sales" element |

#### 💬 Conversational Follow-ups
VoicePilot remembers context, so you can ask follow-up questions:

```
You:  "Find pricing."
AI:   Navigates to pricing section.

You:  "Which plan is best for startups?"
AI:   Analyzes pricing and recommends a plan.

You:  "Compare it with the enterprise plan."
AI:   Compares the two plans based on page content.
```

---

## 🧠 How It Works

### 1. DOM Extraction (`dom-extractor.ts`)
When you ask about a page, VoicePilot extracts a structured representation:

```json
{
  "url": "https://example.com/pricing",
  "title": "Acme — Pricing Plans",
  "headings": [
    { "level": 1, "text": "Simple, transparent pricing" },
    { "level": 2, "text": "Starter" },
    { "level": 2, "text": "Professional" }
  ],
  "sections": [
    { "heading": "Starter", "text": "$9/mo — Perfect for individuals..." },
    { "heading": "Professional", "text": "$29/mo — For growing teams..." }
  ],
  "buttons": ["Get Started", "Contact Sales", "Start Free Trial"],
  "links": ["Home", "Features", "Pricing", "Blog", "Contact"]
}
```

### 2. Intent Classification (`intent-router.ts`)
User speech is classified into structured intents:

- **Local detection** — Fast keyword matching for simple commands (scroll, back, click)
- **AI classification** — GPT-4o-mini for ambiguous or complex requests

```
"Find pricing"  →  { type: "navigate_section", target: "pricing" }
"Scroll down"   →  { type: "scroll", target: "down" }
"What is this?"  →  { type: "summarize_page" }
```

### 3. Action Execution (`navigator.ts`)
Navigation intents are executed directly on the page:
- **Fuzzy heading matching** for section navigation
- **Best-score element matching** for click commands
- **Visual highlight** before clicking (brief outline flash)

### 4. AI Response (`ai-chat.ts`)
For understanding intents, the page context is injected into GPT-4o's system prompt, enabling accurate, page-aware responses that feel natural when spoken aloud.

---

## 🎨 Voice Orb States

| State | Visual | Trigger |
|-------|--------|---------|
| **Idle** | Subtle breathing glow, indigo gradient | Default state |
| **Listening** | Pulsing rings, violet glow | User clicked orb |
| **Processing** | Spinning hue-rotate gradient | Waiting for AI response |
| **Speaking** | Animated waveform bars, cyan glow | AI is responding |
| **Error** | Red pulse, shake animation | Something went wrong |

---

## ⚙️ Configuration Options

| Setting | Description | Required |
|---------|------------|----------|
| **OpenAI API Key** | Powers AI understanding and conversation | ✅ Yes |
| **ElevenLabs API Key** | Premium natural voice synthesis | ❌ Optional |
| **Firecrawl API Key** | Deep page scraping for complex sites | ❌ Optional |
| **Cloudflare Proxy URL** | Route API calls through a proxy for security | ❌ Optional |
| **Voice ID** | ElevenLabs voice selection (default: Rachel) | ❌ Optional |
| **Show Subtitles** | Toggle transcript panel visibility | ❌ Optional |

### Using a Cloudflare Worker Proxy

For production use, you can route API calls through a Cloudflare Worker to keep your API keys secure:

```
POST /api/chat    →  Proxies to OpenAI
POST /api/tts     →  Proxies to ElevenLabs
POST /api/stt     →  Proxies to ElevenLabs
POST /api/scrape  →  Proxies to Firecrawl
```

Set the **Cloudflare Proxy URL** in settings to your deployed worker's URL.

---

## 🛠️ Development

### Scripts

```bash
# Build for production
npm run build

# Watch mode (auto-rebuild on file changes)
npm run dev
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Extension | Manifest V3 + TypeScript | Chrome extension framework |
| Build | Vite + vite-plugin-web-extension | Fast builds, HMR, TS support |
| Styling | Vanilla CSS | Glassmorphism, animations |
| AI | OpenAI GPT-4o | Page understanding + conversation |
| Voice Out | ElevenLabs TTS | Natural voice synthesis |
| Voice In | Web Speech API | Browser-native speech recognition |
| Scraping | Firecrawl | Deep content extraction |

### Key Design Decisions

- **Iframe-based overlay** — Prevents CSS/JS conflicts with host pages
- **Web Speech API for STT** — Zero-cost, works offline, no API key needed
- **Intent router with local fallback** — Simple commands (scroll, back) execute instantly without API calls
- **Rolling conversation history** — Last 20 messages kept for context, cleared on tab switch
- **Dual extraction strategy** — Fast local DOM extraction + optional deep Firecrawl scraping

---

## 🔒 Privacy & Security

- **Bring your own API keys** — users provide their own keys for OpenAI, ElevenLabs, and optional Firecrawl
- **Keys are stored locally** in `chrome.storage.local` on the user's browser profile
- **No VoicePilot backend collection** — the extension does not send user content to a developer-owned backend by default
- **Direct provider calls** — requests go directly to OpenAI/ElevenLabs/Firecrawl, or to a user-configured proxy URL
- **No telemetry or analytics** by default
- **Microphone use is user-triggered** from the extension UI
- **Page content processing is in-browser first**, with relevant extracted content sent only to configured AI providers for requested features

### Compliance and Policy Documents

- Privacy Policy: [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md)
- Chrome Web Store Data Disclosure Mapping: [`DATA_DISCLOSURE.md`](DATA_DISCLOSURE.md)
- Affiliate Disclosure: [`AFFILIATE_DISCLOSURE.md`](AFFILIATE_DISCLOSURE.md)
- Submission Checklist: [`CWS_SUBMISSION_CHECKLIST.md`](CWS_SUBMISSION_CHECKLIST.md)

---

## 🗺️ Roadmap

- [x] Voice Orb with animated states
- [x] Web Speech API integration (STT)
- [x] ElevenLabs TTS with browser fallback
- [x] DOM extraction and semantic mapping
- [x] Intent router (local + AI)
- [x] Navigation engine (scroll, click, section nav)
- [x] Conversation memory
- [x] Settings popup with API key management
- [x] Glassmorphism premium UI
- [ ] Continuous listening mode (wake-word activation)
- [ ] Firecrawl deep scraping integration
- [ ] Cloudflare Worker proxy template
- [ ] Multi-language support
- [ ] Custom voice selection UI
- [ ] Keyboard shortcuts
- [ ] Page action highlighting (visual feedback)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **[OpenAI](https://openai.com)** — GPT-4o for intelligent page understanding
- **[ElevenLabs](https://elevenlabs.io)** — Natural voice synthesis
- **[Firecrawl](https://firecrawl.dev)** — Web scraping and content extraction
- **[Vite](https://vite.dev)** — Lightning-fast build tooling
- **[vite-plugin-web-extension](https://github.com/nicedoc/vite-plugin-web-extension)** — Seamless extension development

---

<p align="center">
  <strong>VoicePilot</strong> — The internet was designed for clicking. We redesigned it for conversation.
</p>
