// ─────────────────────────────────────────────
// VoicePilot — Navigation Engine
// Voice-driven navigation with fuzzy matching
// and smart suggestions when no match is found
// ─────────────────────────────────────────────

/**
 * Scroll the page in a direction
 */
export function scrollPage(
  direction: "up" | "down" | "top" | "bottom"
): string {
  const scrollAmount = window.innerHeight * 0.7;

  switch (direction) {
    case "up":
      window.scrollBy({ top: -scrollAmount, behavior: "smooth" });
      return "Scrolled up.";
    case "down":
      window.scrollBy({ top: scrollAmount, behavior: "smooth" });
      return "Scrolled down.";
    case "top":
      window.scrollTo({ top: 0, behavior: "smooth" });
      return "Scrolled to the top of the page.";
    case "bottom":
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
      });
      return "Scrolled to the bottom of the page.";
    default:
      return "Unknown scroll direction.";
  }
}

/**
 * Collect all navigable sections/links on the page
 */
export function getAvailableSections(): string[] {
  const sections: Set<string> = new Set();

  // From headings
  document.querySelectorAll("h1, h2, h3, h4").forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 1 && text.length < 80) {
      sections.add(text);
    }
  });

  // From navigation links
  document.querySelectorAll("nav a, header a, [role='navigation'] a").forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 1 && text.length < 50) {
      sections.add(text);
    }
  });

  // From section aria-labels / IDs
  document.querySelectorAll("section[id], section[aria-label]").forEach((el) => {
    const label = el.getAttribute("aria-label") || el.id?.replace(/[-_]/g, " ");
    if (label && label.length > 1) {
      sections.add(label);
    }
  });

  return Array.from(sections).slice(0, 30);
}

/**
 * Simple Levenshtein distance for fuzzy matching
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity score (0-1, higher is better)
 */
function similarity(a: string, b: string): number {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();

  // Exact match
  if (al === bl) return 1.0;

  // Contains match (either direction)
  if (al.includes(bl) || bl.includes(al)) return 0.85;

  // Word overlap
  const aWords = al.split(/\s+/);
  const bWords = bl.split(/\s+/);
  const commonWords = aWords.filter((w) => bWords.some((bw) => bw.includes(w) || w.includes(bw)));
  if (commonWords.length > 0) {
    const wordScore = commonWords.length / Math.max(aWords.length, bWords.length);
    if (wordScore >= 0.5) return 0.6 + wordScore * 0.2;
  }

  // Levenshtein similarity
  const maxLen = Math.max(al.length, bl.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshtein(al, bl);
  const levScore = 1 - dist / maxLen;

  return levScore;
}

/**
 * Find the best fuzzy match from a list of candidates
 */
function findBestMatch(
  target: string,
  candidates: { text: string; element: Element }[]
): { match: { text: string; element: Element } | null; score: number; closeCandidates: string[] } {
  let bestMatch: { text: string; element: Element } | null = null;
  let bestScore = 0;
  const scored: { text: string; score: number }[] = [];

  for (const candidate of candidates) {
    const score = similarity(target, candidate.text);
    scored.push({ text: candidate.text, score });

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  // Get close candidates (score > 0.3) for suggestions
  const closeCandidates = scored
    .filter((s) => s.score > 0.3 && s.text !== bestMatch?.text)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.text);

  return { match: bestScore >= 0.45 ? bestMatch : null, score: bestScore, closeCandidates };
}

/**
 * Navigate to a section with fuzzy matching and smart suggestions.
 * Returns a result object with status, message, and available sections.
 */
export function navigateToSection(target: string): string {
  const normalizedTarget = target.toLowerCase().trim();

  // ── Strategy 1: Exact ID match ──
  const byId = document.getElementById(normalizedTarget) ||
    document.getElementById(normalizedTarget.replace(/\s+/g, "-")) ||
    document.getElementById(normalizedTarget.replace(/\s+/g, "_"));
  if (byId) {
    byId.scrollIntoView({ behavior: "smooth", block: "start" });
    highlightElement(byId);
    return `Navigated to the "${target}" section.`;
  }

  // ── Build candidate list from all navigable elements ──
  const candidates: { text: string; element: Element }[] = [];

  // Headings
  document.querySelectorAll("h1, h2, h3, h4, h5").forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 1) {
      candidates.push({ text, element: el });
    }
  });

  // Sections with headings
  document.querySelectorAll("section, article, [role='region']").forEach((el) => {
    const heading = el.querySelector("h1, h2, h3");
    const text = heading?.textContent?.trim() ||
      el.getAttribute("aria-label") ||
      el.id?.replace(/[-_]/g, " ");
    if (text && text.length > 1) {
      candidates.push({ text, element: el });
    }
  });

  // Navigation links
  document.querySelectorAll("nav a, header a, [role='navigation'] a").forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 1 && text.length < 60) {
      candidates.push({ text, element: el });
    }
  });

  // ── Strategy 2: Fuzzy match against all candidates ──
  const { match, score, closeCandidates } = findBestMatch(target, candidates);

  if (match && score >= 0.45) {
    // Good enough match — navigate
    const el = match.element;

    if (el.tagName === "A") {
      const href = (el as HTMLAnchorElement).href;
      if (href.includes("#")) {
        const anchor = href.split("#")[1];
        const anchorEl = document.getElementById(anchor);
        if (anchorEl) {
          anchorEl.scrollIntoView({ behavior: "smooth", block: "start" });
          highlightElement(anchorEl);
          return `Navigated to "${match.text}".`;
        }
      }
      // Click the link
      highlightElement(el);
      setTimeout(() => (el as HTMLElement).click(), 500);
      return `Clicking navigation link "${match.text}".`;
    }

    // Scroll to the element
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    highlightElement(el);

    // If the match text is very different, mention what we found
    if (score < 0.75) {
      return `I couldn't find exactly "${target}", but I found "${match.text}" which seems close. I've navigated there.`;
    }
    return `Navigated to "${match.text}".`;
  }

  // ── Strategy 3: No good match — return suggestions ──
  const available = getAvailableSections();

  if (closeCandidates.length > 0) {
    return `SUGGEST: I couldn't find "${target}" on this page. Did you mean one of these? ${closeCandidates.join(", ")}. Available sections: ${available.slice(0, 10).join(", ")}.`;
  }

  if (available.length > 0) {
    return `SUGGEST: I couldn't find "${target}" on this page. Here are the available sections you can navigate to: ${available.slice(0, 10).join(", ")}.`;
  }

  return `SUGGEST: I couldn't find a section matching "${target}" on this page. The page doesn't seem to have clearly labeled sections.`;
}

/**
 * Click an element with fuzzy matching and suggestions
 */
export function clickElement(target: string): string {
  const normalizedTarget = target.toLowerCase().trim();

  const clickables = document.querySelectorAll(
    'button, [role="button"], a, input[type="submit"], input[type="button"]'
  );

  const candidates: { text: string; element: Element }[] = [];

  for (const el of clickables) {
    const text =
      el.textContent?.toLowerCase().trim() ||
      (el as HTMLInputElement).value?.toLowerCase() ||
      el.getAttribute("aria-label")?.toLowerCase() ||
      "";

    if (text && text.length > 0 && text.length < 100) {
      candidates.push({ text, element: el });
    }
  }

  const { match, score, closeCandidates } = findBestMatch(target, candidates);

  if (match && score >= 0.45) {
    const el = match.element as HTMLElement;
    highlightElement(el);

    setTimeout(() => {
      el.click();
    }, 500);

    const label = match.text || target;
    if (score < 0.75) {
      return `I couldn't find exactly "${target}", but I found "${label}" which seems close. Clicking it now.`;
    }
    return `Clicking "${label}".`;
  }

  // No match — suggest available clickable elements
  const availableButtons = candidates
    .filter((c) => c.text.length < 40)
    .slice(0, 10)
    .map((c) => c.text);

  if (closeCandidates.length > 0) {
    return `SUGGEST: I couldn't find "${target}". Did you mean: ${closeCandidates.join(", ")}?`;
  }

  if (availableButtons.length > 0) {
    return `SUGGEST: I couldn't find "${target}". Available buttons and links: ${availableButtons.join(", ")}.`;
  }

  return `SUGGEST: Could not find a clickable element matching "${target}".`;
}

/**
 * Highlight an element briefly before interacting with it
 */
function highlightElement(el: Element) {
  const htmlEl = el as HTMLElement;
  const originalOutline = htmlEl.style.outline;
  const originalOutlineOffset = htmlEl.style.outlineOffset;
  const originalTransition = htmlEl.style.transition;

  htmlEl.style.transition = "outline 0.2s ease, outline-offset 0.2s ease";
  htmlEl.style.outline = "3px solid #8b5cf6";
  htmlEl.style.outlineOffset = "4px";

  setTimeout(() => {
    htmlEl.style.outline = "3px solid rgba(139, 92, 246, 0)";
    setTimeout(() => {
      htmlEl.style.outline = originalOutline;
      htmlEl.style.outlineOffset = originalOutlineOffset;
      htmlEl.style.transition = originalTransition;
    }, 300);
  }, 1200);
}

/**
 * Go back in browser history
 */
export function goBack(): string {
  window.history.back();
  return "Going back to the previous page.";
}

/**
 * Go forward in browser history
 */
export function goForward(): string {
  window.history.forward();
  return "Going forward.";
}

/**
 * Navigate to homepage by clicking the site logo or home link.
 * Tries multiple strategies to find the logo/home element.
 */
export function goHome(): string {
  // Strategy 1: Logo image/SVG inside a link in the header
  const headerLogoSelectors = [
    'header a img',
    'header a svg',
    'header a[href="/"] img',
    'header a[href="/"] svg',
    'header .logo a',
    'header a.logo',
    'header [class*="logo"] a',
    'header a[class*="logo"]',
    'nav a img',
    'nav a svg',
    '[class*="navbar"] a img',
    '[class*="navbar"] a svg',
    '[class*="header"] a img',
    '[class*="header"] a svg',
  ];

  for (const selector of headerLogoSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      // Find the parent <a> tag
      const link = el.closest("a") || el;
      highlightElement(link);
      setTimeout(() => (link as HTMLElement).click(), 500);
      return 'Clicking the site logo to go to the homepage.';
    }
  }

  // Strategy 2: Link with href="/" or site root in header/nav
  const homeLinks = document.querySelectorAll(
    'header a[href="/"], nav a[href="/"], header a[href="./"], a[href="/"][class*="logo"], a[href="/"][class*="brand"]'
  );
  if (homeLinks.length > 0) {
    const link = homeLinks[0] as HTMLElement;
    highlightElement(link);
    setTimeout(() => link.click(), 500);
    const text = link.textContent?.trim() || "Home";
    return `Clicking "${text}" to go to the homepage.`;
  }

  // Strategy 3: Any link with "home" text in nav
  const navLinks = document.querySelectorAll("nav a, header a");
  for (const link of navLinks) {
    const text = link.textContent?.toLowerCase().trim() || "";
    if (text === "home" || text === "homepage" || text === "main") {
      highlightElement(link);
      setTimeout(() => (link as HTMLElement).click(), 500);
      return `Clicking "${link.textContent?.trim()}" to go home.`;
    }
  }

  // Strategy 4: First link in the header (usually the logo)
  const firstHeaderLink = document.querySelector("header a");
  if (firstHeaderLink) {
    highlightElement(firstHeaderLink);
    setTimeout(() => (firstHeaderLink as HTMLElement).click(), 500);
    return "Clicking the first header link to go home.";
  }

  // Strategy 5: Navigate to the site root URL
  const rootUrl = window.location.origin + "/";
  if (window.location.href !== rootUrl) {
    window.location.href = rootUrl;
    return "Navigating to the homepage.";
  }

  return "You're already on the homepage.";
}

// ── Media Control ──────────────────────────

// Track which elements we paused so we can resume only those
let pausedMediaElements: HTMLMediaElement[] = [];

/**
 * Pause ALL audio/video elements on the page.
 * Called before VoicePilot speaks to prevent interference.
 */
export function pauseAllPageMedia(): string {
  pausedMediaElements = [];

  const mediaElements = document.querySelectorAll<HTMLMediaElement>("audio, video");
  let count = 0;

  mediaElements.forEach((el) => {
    if (!el.paused) {
      el.pause();
      pausedMediaElements.push(el);
      count++;
    }
  });

  // Also handle iframes with YouTube/embedded players
  const iframes = document.querySelectorAll("iframe");
  iframes.forEach((iframe) => {
    try {
      // Send postMessage to pause YouTube/Vimeo embeds
      iframe.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "pauseVideo" }),
        "*"
      );
      iframe.contentWindow?.postMessage(
        JSON.stringify({ method: "pause" }),
        "*"
      );
    } catch (e) {
      // Cross-origin — can't control
    }
  });

  if (count > 0) {
    console.log(`[VoicePilot] Paused ${count} media element(s).`);
    return `Paused ${count} audio/video element(s).`;
  }
  return "No media playing.";
}

/**
 * Resume media that was paused by pauseAllPageMedia.
 */
export function resumePageMedia(): string {
  let count = 0;

  pausedMediaElements.forEach((el) => {
    try {
      if (el.paused && document.contains(el)) {
        el.play().catch(() => {});
        count++;
      }
    } catch (e) {
      // Element may have been removed
    }
  });

  pausedMediaElements = [];

  if (count > 0) return `Resumed ${count} media element(s).`;
  return "No media to resume.";
}

/**
 * Find and play a media element matching the target.
 * Handles: audio elements, video elements, play buttons.
 */
export function playMedia(target?: string): string {
  // Strategy 1: Find audio/video elements
  const mediaElements = document.querySelectorAll<HTMLMediaElement>("audio, video");

  if (target) {
    // Try to match by nearby text, title, or aria-label
    for (const el of mediaElements) {
      const context = (
        el.getAttribute("title") ||
        el.getAttribute("aria-label") ||
        el.closest("[class]")?.textContent ||
        ""
      ).toLowerCase();

      if (context.includes(target.toLowerCase())) {
        el.play().catch(() => {});
        highlightElement(el);
        return `Playing "${target}".`;
      }
    }
  }

  // Strategy 2: Play the first paused media element
  for (const el of mediaElements) {
    if (el.paused && el.src) {
      el.play().catch(() => {});
      highlightElement(el);
      const label = el.getAttribute("title") || "media";
      return `Playing ${label}.`;
    }
  }

  // Strategy 3: Find and click a play button
  const playButtons = document.querySelectorAll<HTMLElement>(
    'button[aria-label*="play" i], button[title*="play" i], [role="button"][aria-label*="play" i], .play-button, [class*="play-btn"], [class*="play_btn"]'
  );

  if (playButtons.length > 0) {
    const btn = playButtons[0];
    highlightElement(btn);
    setTimeout(() => btn.click(), 400);
    return "Clicking the play button.";
  }

  return "SUGGEST: I couldn't find any audio or video to play on this page.";
}

// ── Search ─────────────────────────────────

/**
 * Find the search input on the page, type the query, and submit.
 */
export function searchOnPage(query: string): string {
  if (!query || query.trim().length === 0) {
    return "SUGGEST: What would you like me to search for?";
  }

  // Strategy 1: Find search input directly
  const searchSelectors = [
    'input[type="search"]',
    'input[name="q"]',
    'input[name="query"]',
    'input[name="search"]',
    'input[name="s"]',
    'input[placeholder*="search" i]',
    'input[placeholder*="Search" i]',
    'input[aria-label*="search" i]',
    'input[aria-label*="Search" i]',
    '[role="search"] input',
    '[role="searchbox"]',
    'form[action*="search"] input[type="text"]',
    'form[action*="search"] input:not([type="hidden"])',
  ];

  for (const selector of searchSelectors) {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (input) {
      // Focus and fill the search input
      input.focus();
      input.value = query;

      // Dispatch input events to trigger React/Vue/Angular bindings
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      highlightElement(input);

      // Submit the form after a brief delay
      setTimeout(() => {
        const form = input.closest("form");
        if (form) {
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          // If the submit event isn't prevented, submit the form
          try { form.submit(); } catch (e) { /* handled by event */ }
        } else {
          // Try pressing Enter
          input.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })
          );
          input.dispatchEvent(
            new KeyboardEvent("keypress", { key: "Enter", code: "Enter", bubbles: true })
          );
          input.dispatchEvent(
            new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true })
          );
        }
      }, 600);

      return `Searching for "${query}".`;
    }
  }

  // Strategy 2: Click a search icon/button to open search overlay
  const searchButtons = document.querySelectorAll<HTMLElement>(
    'button[aria-label*="search" i], a[aria-label*="search" i], [class*="search-icon"], [class*="search-btn"], [class*="search_icon"]'
  );

  if (searchButtons.length > 0) {
    const btn = searchButtons[0];
    highlightElement(btn);
    btn.click();

    // Wait for search overlay to open, then fill
    setTimeout(() => {
      for (const selector of searchSelectors) {
        const input = document.querySelector<HTMLInputElement>(selector);
        if (input) {
          input.focus();
          input.value = query;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));

          setTimeout(() => {
            const form = input.closest("form");
            if (form) {
              form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
              try { form.submit(); } catch (e) { /* handled */ }
            } else {
              input.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })
              );
            }
          }, 400);

          break;
        }
      }
    }, 800);

    return `Opening search and looking for "${query}".`;
  }

  return `SUGGEST: I couldn't find a search box on this page. You might want to try navigating to a page that has search functionality.`;
}

// ── Media Lock (prevents auto-play during TTS) ──

let originalPlay: typeof HTMLMediaElement.prototype.play | null = null;
let isMediaLocked = false;

/**
 * Lock ALL page media by monkey-patching HTMLMediaElement.prototype.play.
 * This prevents ANY audio/video from starting while VoicePilot is speaking.
 * This is the nuclear option to fix the auto-play loop bug.
 */
export function lockPageMedia(): string {
  if (isMediaLocked) return "Media already locked.";

  // First, pause everything that's currently playing
  pauseAllPageMedia();

  // Monkey-patch play() to prevent future plays
  originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    // Check if this is a VoicePilot audio element (in the iframe)
    // Page elements should be blocked, but VoicePilot's own audio plays in iframe
    // so this only affects the main page context
    console.log("[VoicePilot] Blocked page audio from playing during TTS.");
    return Promise.resolve();
  };

  isMediaLocked = true;
  console.log("[VoicePilot] Media lock engaged — page audio blocked.");
  return "Media locked.";
}

/**
 * Unlock page media — restore normal play() behavior.
 */
export function unlockPageMedia(): string {
  if (!isMediaLocked || !originalPlay) return "Media not locked.";

  HTMLMediaElement.prototype.play = originalPlay;
  originalPlay = null;
  isMediaLocked = false;

  console.log("[VoicePilot] Media lock released — page audio unblocked.");
  return "Media unlocked.";
}

// ── Form Filling ───────────────────────────

/**
 * Find a form field by label/placeholder/name and fill it with a value.
 */
export function fillFormField(fieldName: string, value: string): string {
  if (!fieldName || !value) {
    return "SUGGEST: Please specify both the field name and value. For example, say 'fill name with John'.";
  }

  const normalizedField = fieldName.toLowerCase().trim();

  // Strategy 1: Find by <label> text
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    const labelText = label.textContent?.toLowerCase().trim() || "";
    if (labelText.includes(normalizedField) || normalizedField.includes(labelText)) {
      const forId = label.getAttribute("for");
      let input: HTMLInputElement | HTMLTextAreaElement | null = null;

      if (forId) {
        input = document.getElementById(forId) as HTMLInputElement | null;
      }
      if (!input) {
        input = label.querySelector("input, textarea, select") as HTMLInputElement | null;
      }

      if (input) {
        return setInputValue(input, value, labelText);
      }
    }
  }

  // Strategy 2: Find by placeholder text
  const allInputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea'
  );
  for (const input of allInputs) {
    const placeholder = (input.getAttribute("placeholder") || "").toLowerCase();
    const name = (input.getAttribute("name") || "").toLowerCase();
    const ariaLabel = (input.getAttribute("aria-label") || "").toLowerCase();
    const id = (input.id || "").toLowerCase();

    if (
      placeholder.includes(normalizedField) ||
      name.includes(normalizedField) ||
      ariaLabel.includes(normalizedField) ||
      id.includes(normalizedField) ||
      normalizedField.includes(placeholder) ||
      normalizedField.includes(name)
    ) {
      return setInputValue(input, value, placeholder || name || id);
    }
  }

  // Strategy 3: Fuzzy match by common field names
  const fieldAliases: Record<string, string[]> = {
    name: ["name", "full name", "your name", "fullname", "first name", "firstname"],
    email: ["email", "e-mail", "email address", "your email"],
    phone: ["phone", "tel", "telephone", "mobile", "phone number"],
    password: ["password", "pass", "passwd"],
    message: ["message", "comment", "feedback", "your message", "description", "body", "text"],
    subject: ["subject", "title", "topic"],
    address: ["address", "street", "location"],
    city: ["city", "town"],
    company: ["company", "organization", "org"],
  };

  for (const [key, aliases] of Object.entries(fieldAliases)) {
    if (aliases.some((a) => normalizedField.includes(a) || a.includes(normalizedField))) {
      // Try to find input matching this key
      for (const input of allInputs) {
        const inputName = (input.getAttribute("name") || "").toLowerCase();
        const inputType = (input.getAttribute("type") || "").toLowerCase();
        const inputId = (input.id || "").toLowerCase();
        const inputPlaceholder = (input.getAttribute("placeholder") || "").toLowerCase();

        if (
          inputName.includes(key) || inputId.includes(key) ||
          inputPlaceholder.includes(key) || inputType === key
        ) {
          return setInputValue(input, value, key);
        }
      }
    }
  }

  // List available fields
  const availableFields: string[] = [];
  allInputs.forEach((input) => {
    const label = input.getAttribute("placeholder") ||
      input.getAttribute("aria-label") ||
      input.getAttribute("name") ||
      input.id || "";
    if (label && label.length < 50) availableFields.push(label);
  });

  if (availableFields.length > 0) {
    return `SUGGEST: I couldn't find a "${fieldName}" field. Available fields: ${availableFields.join(", ")}.`;
  }
  return `SUGGEST: I couldn't find any form fields on this page.`;
}

/**
 * Set value on an input element with proper event dispatching
 */
function setInputValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  fieldLabel: string
): string {
  input.focus();

  // Use native input setter to work with React/Vue
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value"
  )?.set;
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, "value"
  )?.set;

  if (input.tagName === "TEXTAREA" && nativeTextAreaValueSetter) {
    nativeTextAreaValueSetter.call(input, value);
  } else if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }

  // Fire all necessary events for framework compatibility
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));

  highlightElement(input);
  return `Filled "${fieldLabel}" with "${value}".`;
}

/**
 * Submit the current/visible form
 */
export function submitCurrentForm(): string {
  // Try the focused element's form first
  const activeEl = document.activeElement;
  if (activeEl) {
    const form = activeEl.closest("form");
    if (form) {
      highlightElement(form);
      setTimeout(() => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        try { form.submit(); } catch (e) { /* handled by event */ }
      }, 400);
      return "Submitting the form.";
    }
  }

  // Find submit buttons
  const submitBtns = document.querySelectorAll<HTMLElement>(
    'button[type="submit"], input[type="submit"], button:not([type])'
  );

  for (const btn of submitBtns) {
    // Check if it's visible
    const rect = btn.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      highlightElement(btn);
      setTimeout(() => btn.click(), 400);
      const label = btn.textContent?.trim() || "Submit";
      return `Clicking "${label}" to submit.`;
    }
  }

  // Find any visible form and submit it
  const forms = document.querySelectorAll("form");
  for (const form of forms) {
    const rect = form.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      try { form.submit(); } catch (e) { /* handled */ }
      return "Submitting the form.";
    }
  }

  return "SUGGEST: I couldn't find a form to submit on this page.";
}

// ── Message Sending ────────────────────────

/**
 * Find a message/chat input and send a message.
 * Works with chat UIs, contact forms, comment boxes, etc.
 */
export function sendMessage(text: string): string {
  if (!text || text.trim().length === 0) {
    return "SUGGEST: What message would you like me to send?";
  }

  // Strategy 1: Find chat/message input areas
  const messageSelectors = [
    // Chat apps (Slack, Discord, WhatsApp Web, etc.)
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][aria-label*="message" i]',
    '[contenteditable="true"][data-placeholder*="message" i]',
    '[contenteditable="true"]',
    // Standard message inputs
    'textarea[name*="message" i]',
    'textarea[placeholder*="message" i]',
    'textarea[placeholder*="type" i]',
    'textarea[aria-label*="message" i]',
    'textarea[name*="comment" i]',
    'textarea[placeholder*="comment" i]',
    'textarea[name*="body" i]',
    'textarea[name*="text" i]',
    // Generic textareas (last resort)
    'textarea',
    // Input fields for messages
    'input[name*="message" i]',
    'input[placeholder*="message" i]',
    'input[placeholder*="type" i]',
  ];

  for (const selector of messageSelectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;

    // Check visibility
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    el.focus();

    if (el.getAttribute("contenteditable") === "true") {
      // ContentEditable (chat apps like Slack/Discord)
      el.textContent = text;
      el.innerHTML = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      // Standard input/textarea
      setInputValue(el as HTMLInputElement | HTMLTextAreaElement, text, "message");
    }

    highlightElement(el);

    // Try to find and click the send button
    setTimeout(() => {
      const sendBtn = findSendButton();
      if (sendBtn) {
        highlightElement(sendBtn);
        setTimeout(() => sendBtn.click(), 300);
      } else {
        // Try Enter key
        el.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })
        );
      }
    }, 500);

    return `Sending message: "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"`;
  }

  return `SUGGEST: I couldn't find a message input on this page.`;
}

/**
 * Find the send/submit button for a message
 */
function findSendButton(): HTMLElement | null {
  const sendSelectors = [
    'button[aria-label*="send" i]',
    'button[title*="send" i]',
    'button[type="submit"]',
    '[role="button"][aria-label*="send" i]',
    'button:has(svg)', // Icon-only send buttons (common in chat UIs)
  ];

  for (const selector of sendSelectors) {
    try {
      const btn = document.querySelector<HTMLElement>(selector);
      if (btn) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return btn;
      }
    } catch (e) {
      // :has() might not be supported
    }
  }

  // Try text-based matching
  const buttons = document.querySelectorAll<HTMLElement>("button, [role='button']");
  for (const btn of buttons) {
    const text = btn.textContent?.toLowerCase().trim() || "";
    const ariaLabel = btn.getAttribute("aria-label")?.toLowerCase() || "";
    if (
      text === "send" || text === "submit" || text === "post" ||
      ariaLabel.includes("send") || ariaLabel.includes("submit")
    ) {
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return btn;
    }
  }

  return null;
}
