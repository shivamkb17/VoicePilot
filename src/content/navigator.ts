// ─────────────────────────────────────────────
// VoicePilot — Navigation Engine
// Voice-driven navigation with fuzzy matching
// and smart suggestions when no match is found
// ─────────────────────────────────────────────

// Track the last focused input (in case user clicks the mic orb and input loses focus)
let lastFocusedInput: HTMLElement | null = null;
document.addEventListener("focusin", (e) => {
  const target = e.target as HTMLElement;
  if (isEditableElement(target)) {
    lastFocusedInput = target;
  }
});

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

  // Word overlap — critical for blog title matching where speech recognition
  // may slightly mangle words (e.g. "getting started" vs "getting started with react")
  const aWords = al.split(/\s+/).filter(w => w.length > 1);
  const bWords = bl.split(/\s+/).filter(w => w.length > 1);
  const commonWords = aWords.filter((w) => bWords.some((bw) => bw.includes(w) || w.includes(bw)));
  if (commonWords.length > 0) {
    const wordScore = commonWords.length / Math.max(aWords.length, bWords.length);
    // For multi-word phrases (like blog titles), a high word overlap is a strong signal
    if (commonWords.length >= 2 && wordScore >= 0.4) return 0.65 + wordScore * 0.25;
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

  // Use a slightly lower threshold for multi-word targets (e.g. blog titles)
  // since speech recognition often introduces minor variations
  const targetWords = target.trim().split(/\s+/).length;
  const threshold = targetWords >= 3 ? 0.40 : 0.45;

  return { match: bestScore >= threshold ? bestMatch : null, score: bestScore, closeCandidates };
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
  const seenTexts = new Set<string>();

  const addCandidate = (text: string, element: Element) => {
    const key = text.toLowerCase().trim();
    if (key.length > 1 && !seenTexts.has(key)) {
      seenTexts.add(key);
      candidates.push({ text: text.trim(), element });
    }
  };

  // Headings
  document.querySelectorAll("h1, h2, h3, h4, h5").forEach((el) => {
    const text = el.textContent?.trim();
    if (text) addCandidate(text, el);
  });

  // Sections with headings
  document.querySelectorAll("section, article, [role='region']").forEach((el) => {
    const heading = el.querySelector("h1, h2, h3");
    const text = heading?.textContent?.trim() ||
      el.getAttribute("aria-label") ||
      el.id?.replace(/[-_]/g, " ");
    if (text) addCandidate(text, el);
  });

  // ── Blog / Article card links ──
  // Blog listing pages often wrap entire cards in <a> tags. The full textContent
  // includes title + excerpt + date + author, so it won't match a spoken title.
  // Instead, extract the heading *inside* the link as a separate candidate.
  document.querySelectorAll("a").forEach((el) => {
    const innerHeading = el.querySelector("h1, h2, h3, h4, h5");
    if (innerHeading) {
      const headingText = innerHeading.textContent?.trim();
      // Use the link (<a>) as the element so clicking navigates to the blog post
      if (headingText && headingText.length > 1) {
        addCandidate(headingText, el);
      }
    }

    // Also check for title/aria-label attributes on links (common in card UIs)
    const titleAttr = el.getAttribute("title")?.trim();
    if (titleAttr && titleAttr.length > 1) {
      addCandidate(titleAttr, el);
    }
  });

  // Interactive elements (links, buttons, etc)
  document.querySelectorAll("a, button, [role='button']").forEach((el) => {
    const text = el.textContent?.trim() || el.getAttribute("aria-label")?.trim() || "";
    // Allow longer text for links (blog titles can be long) but cap at 120
    if (text.length > 1 && text.length < 120) {
      addCandidate(text, el);
    }
  });

  // ── Strategy 2: Fuzzy match against all candidates ──
  const { match, score, closeCandidates } = findBestMatch(target, candidates);

  if (match && score >= 0.45) {
    // Good enough match — navigate
    const el = match.element;
    const htmlEl = el as HTMLElement;

    const isInteractive = el.tagName === "A" || el.tagName === "BUTTON" || el.getAttribute("role") === "button";

    if (isInteractive) {
      if (el.tagName === "A") {
        const href = (el as HTMLAnchorElement).href;
        if (href && href.includes("#") && !href.startsWith("javascript:")) {
          const anchor = href.split("#")[1];
          if (anchor) {
            const anchorEl = document.getElementById(anchor);
            if (anchorEl) {
              anchorEl.scrollIntoView({ behavior: "smooth", block: "start" });
              highlightElement(anchorEl);
              return `Navigated to "${match.text}".`;
            }
          }
        }
      }
      
      // Click the interactive element
      highlightElement(htmlEl);
      setTimeout(() => htmlEl.click(), 500);
      return `Clicking "${match.text}".`;
    }

    // Scroll to the element (headings, sections)
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
let lockObserver: MutationObserver | null = null;

const forcePauseListener = (e: Event) => {
  if (isMediaLocked && e.target instanceof HTMLMediaElement) {
    e.target.pause();
  }
};

/**
 * Lock ALL page media. Multi-layered approach:
 * 1. Pause all currently playing media
 * 2. Monkey-patch HTMLMediaElement.play() to reject new plays (mimics autoplay block)
 * 3. Event listeners on capture phase for 'play' and 'playing' to forcefully pause.
 * 4. MutationObserver to catch dynamically created or modified audio/video and pause them
 */
export function lockPageMedia(): string {
  if (isMediaLocked) return "Media already locked.";

  // 1. Pause everything
  pauseAllPageMedia();

  // 2. Monkey-patch play()
  originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    return Promise.reject(
      new DOMException("play() failed because the user didn't interact with the document first.", "NotAllowedError")
    );
  };

  // 3. Event Listeners
  document.addEventListener("play", forcePauseListener, true);
  document.addEventListener("playing", forcePauseListener, true);

  // 4. MutationObserver — catch dynamically created audio/video or attribute changes
  lockObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLMediaElement) {
            node.pause();
          }
          // Also check children
          if (node instanceof HTMLElement) {
            node.querySelectorAll<HTMLMediaElement>("audio, video").forEach((el) => {
              el.pause();
            });
          }
        }
      } else if (mutation.type === "attributes") {
        if (mutation.target instanceof HTMLMediaElement) {
          mutation.target.pause();
        }
      }
    }
  });

  lockObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "autoplay"]
  });

  isMediaLocked = true;
  console.log("[VoicePilot] Media lock engaged — all page audio blocked.");
  return "Media locked.";
}

/**
 * Unlock page media — restore play() and remove observer.
 */
export function unlockPageMedia(): string {
  if (!isMediaLocked) return "Media not locked.";

  // Restore play()
  if (originalPlay) {
    HTMLMediaElement.prototype.play = originalPlay;
    originalPlay = null;
  }

  // Remove event listeners
  document.removeEventListener("play", forcePauseListener, true);
  document.removeEventListener("playing", forcePauseListener, true);

  // Remove observer
  if (lockObserver) {
    lockObserver.disconnect();
    lockObserver = null;
  }

  isMediaLocked = false;
  console.log("[VoicePilot] Media lock released — page audio unblocked.");
  return "Media unlocked.";
}

// ── Type Text (Dictation into focused field) ──

/**
 * Wait one animation frame — lets frameworks (React/Vue) finish re-rendering
 * after focus() before we try to set the value.
 */
function waitForFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Type text into the currently focused input field, or the first visible one.
 * This is the "dictation mode" — user speaks and text goes into whatever field is active.
 *
 * Returns a Promise because when the target element wasn't previously focused,
 * we need to wait a frame after focus() for frameworks to settle before typing.
 */
export async function typeTextIntoFocused(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    return "SUGGEST: What would you like me to type?";
  }

  // Strategy 1: Use the currently focused element (already focused — type immediately)
  const activeEl = document.activeElement;
  if (activeEl && isEditableElement(activeEl)) {
    return typeIntoElement(activeEl as HTMLElement, text);
  }

  // Strategy 2: Use the exact last focused input we tracked before the orb was clicked
  if (lastFocusedInput && document.contains(lastFocusedInput)) {
    lastFocusedInput.focus();
    return typeIntoElement(lastFocusedInput, text);
  }

  // Strategy 3: Find the first visible input (fallback)
  // This is the path that triggers on the FIRST "type X" command when no field was focused.
  // We must focus the element, wait for the framework to process the focus event
  // (React/Vue may re-render/re-mount the component), then re-resolve the live element.
  const editables = document.querySelectorAll<HTMLElement>(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, [contenteditable]'
  );

  for (const el of editables) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight) {
      // Focus the found element
      el.focus();

      // Wait one frame for framework re-renders to complete
      await waitForFrame();

      // Re-resolve: after the frame, the framework may have replaced the DOM node.
      // document.activeElement now points to the live (possibly re-mounted) element.
      const resolvedEl = document.activeElement as HTMLElement;
      if (resolvedEl && isEditableElement(resolvedEl)) {
        return typeIntoElement(resolvedEl, text);
      }

      // If activeElement didn't stick (rare), fall back to the original reference
      return typeIntoElement(el, text);
    }
  }

  return "SUGGEST: I couldn't find an input field to type into. Please click on the field first, then tell me what to type.";
}

function isEditableElement(el: Element): boolean {
  if (el instanceof HTMLInputElement) {
    const editableTypes = ["text", "email", "password", "search", "tel", "url", "number"];
    return editableTypes.includes(el.type?.toLowerCase() || "text");
  }
  if (el instanceof HTMLTextAreaElement) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function typeIntoElement(el: HTMLElement, text: string): string {
  // Ensure focus (may already be focused from caller)
  if (document.activeElement !== el) {
    el.focus();
  }

  if (el.isContentEditable) {
    // For rich text editors (Draft.js, ProseMirror, Lexical), we must use execCommand
    // to simulate real user typing so their internal state updates correctly.
    const selection = window.getSelection();
    if (selection) {
      // Move cursor to the end of the editable area
      selection.selectAllChildren(el);
      selection.collapseToEnd();
    }
    
    const needsSpace = el.textContent && el.textContent.trim().length > 0;
    const textToInsert = needsSpace ? " " + text : text;
    
    // Execute native typing command
    const success = document.execCommand("insertText", false, textToInsert);
    
    // Fallback if execCommand is blocked
    if (!success) {
      const existing = el.textContent || "";
      el.textContent = existing ? existing + " " + text : text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    
    highlightElement(el);
    return `Typed "${text}" into the field.`;
  }

  const input = el as HTMLInputElement | HTMLTextAreaElement;

  // Cannot programmatically set value on file inputs
  if (input instanceof HTMLInputElement && input.type === "file") {
    return "SUGGEST: File uploads cannot be filled via voice command for security reasons. Please upload the file manually.";
  }

  // Use native setter for React/Vue compatibility
  const nativeInputSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value"
  )?.set;
  const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, "value"
  )?.set;

  // Append to existing value (don't overwrite)
  const existing = input.value || "";
  const newValue = existing ? existing + " " + text : text;

  if (input instanceof HTMLTextAreaElement && nativeTextAreaSetter) {
    nativeTextAreaSetter.call(input, newValue);
  } else if (nativeInputSetter) {
    nativeInputSetter.call(input, newValue);
  } else {
    input.value = newValue;
  }

  // React 16+ specific fallback (React sometimes swallows the native prototype setter)
  const tracker = (input as any)._valueTracker;
  if (tracker) {
    tracker.setValue(existing); // Reset tracker so it sees the new event as a change
  }

  // Fire events for framework compatibility
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  // Also dispatch keyboard events to trigger any keyup/keydown listeners
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));

  // Move cursor to end
  try {
    input.setSelectionRange(newValue.length, newValue.length);
  } catch (e) { /* some input types don't support this */ }

  highlightElement(el);
  const fieldLabel = input.getAttribute("placeholder") || input.getAttribute("name") || input.id || "field";
  return `Typed "${text}" into ${fieldLabel || "the field"}.`;
}

// ── Form Filling ───────────────────────────

export function fillFormField(fieldName: string, value: string): string {
  if (!fieldName || !value) {
    return "SUGGEST: Please specify both the field name and value. For example, say 'fill name with John'.";
  }

  const normalizedField = fieldName.toLowerCase().trim();

  const allInputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]), textarea, select'
  );

  const inputCandidates = Array.from(allInputs).map((input) => {
    let labelText = "";

    // 1. Check for associated <label for="...">
    if (input.id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (labelEl && labelEl.textContent) {
        labelText = labelEl.textContent.trim();
      }
    }

    // 2. Check for wrapping <label>
    if (!labelText) {
      const wrapperLabel = input.closest("label");
      if (wrapperLabel) {
        // Extract just the text nodes to avoid grabbing input values
        labelText = Array.from(wrapperLabel.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent?.trim())
          .join(" ")
          .trim();
      }
    }

    // 3. Check for aria-labelledby
    if (!labelText) {
      const ariaLabelledBy = input.getAttribute("aria-labelledby");
      if (ariaLabelledBy) {
        const labelEl = document.getElementById(ariaLabelledBy);
        if (labelEl && labelEl.textContent) {
          labelText = labelEl.textContent.trim();
        }
      }
    }

    // 4. Heuristic visual label check (DOM traversal)
    if (!labelText) {
      const prevSibling = input.previousSibling;
      if (prevSibling?.nodeType === Node.TEXT_NODE && prevSibling.textContent?.trim()) {
        labelText = prevSibling.textContent.trim();
      } else {
        let prevEl = input.previousElementSibling as HTMLElement;
        if (prevEl && prevEl.textContent?.trim() && !prevEl.querySelector('input, select, textarea')) {
          labelText = prevEl.textContent.trim();
        } else if (input.parentElement) {
          let parentPrev = input.parentElement.previousElementSibling as HTMLElement;
          if (parentPrev && parentPrev.textContent?.trim() && !parentPrev.querySelector('input, select, textarea')) {
            labelText = parentPrev.textContent.trim();
          }
        }
      }
    }

    if (labelText) {
      // Clean up whitespace and ensure it's not a giant paragraph
      labelText = labelText.replace(/\s+/g, " ").trim();
      if (labelText.length > 60) labelText = ""; 
    }

    // Fallbacks
    const ariaLabel = input.getAttribute("aria-label") || "";
    const nameAttr = input.getAttribute("name") || "";
    const idAttr = input.id || "";
    const placeholder = input.getAttribute("placeholder") || "";

    const identifiers = [labelText, ariaLabel, nameAttr, idAttr, placeholder]
      .filter(Boolean)
      .map((s) => s.toLowerCase().trim());

    // Prefer label, then aria-label. 
    // Format name/id slightly if using as display name
    const formatAttr = (str: string) => str.replace(/[-_]/g, " ").trim();
    
    let displayName = labelText || ariaLabel;
    if (!displayName && nameAttr) displayName = formatAttr(nameAttr);
    if (!displayName && idAttr) displayName = formatAttr(idAttr);
    if (!displayName && placeholder) displayName = `Field with placeholder "${placeholder}"`;
    if (!displayName) displayName = "unknown field";

    return { input, identifiers, displayName };
  });

  // Strategy 1: Direct match against any identifier
  for (const candidate of inputCandidates) {
    for (const ident of candidate.identifiers) {
      // Avoid matching very short strings unintentionally
      if (ident.length > 2 && normalizedField.length > 2) {
        if (ident.includes(normalizedField) || normalizedField.includes(ident)) {
          return setInputValue(candidate.input as HTMLInputElement | HTMLTextAreaElement, value, candidate.displayName);
        }
      } else if (ident === normalizedField) {
        return setInputValue(candidate.input as HTMLInputElement | HTMLTextAreaElement, value, candidate.displayName);
      }
    }
  }

  // Strategy 2: Fuzzy match with aliases
  const fieldAliases: Record<string, string[]> = {
    name: ["name", "full name", "your name", "fullname", "first name", "firstname", "last name", "lastname"],
    email: ["email", "e-mail", "email address", "your email", "mail"],
    phone: ["phone", "tel", "telephone", "mobile", "phone number", "contact number"],
    password: ["password", "pass", "passwd", "pin"],
    message: ["message", "comment", "feedback", "your message", "description", "body", "text"],
    subject: ["subject", "title", "topic"],
    address: ["address", "street", "location", "delivery address", "full address", "shipping address"],
    city: ["city", "town", "municipality"],
    state: ["state", "province", "region"],
    zip: ["zip", "postal code", "pincode", "pin code", "zipcode"],
    company: ["company", "organization", "org", "business"],
  };

  for (const [key, aliases] of Object.entries(fieldAliases)) {
    if (aliases.some((a) => normalizedField.includes(a) || a.includes(normalizedField))) {
      for (const candidate of inputCandidates) {
        // If any of the candidate's identifiers match the generic key or its aliases
        const matchFound = candidate.identifiers.some((ident) => 
          ident.includes(key) || aliases.some((alias) => ident.includes(alias))
        );
        
        if (matchFound) {
          return setInputValue(candidate.input as HTMLInputElement | HTMLTextAreaElement, value, candidate.displayName);
        }
      }
    }
  }

  // List available fields cleanly
  const availableFields = inputCandidates
    .map((c) => c.displayName)
    .filter((name) => name.length > 0 && name.length < 50 && name !== "unknown field");

  const uniqueAvailableFields = Array.from(new Set(availableFields));

  if (uniqueAvailableFields.length > 0) {
    return `SUGGEST: I couldn't find a "${fieldName}" field. Available fields: ${uniqueAvailableFields.join(", ")}.`;
  }

  return `SUGGEST: I couldn't find any form fields on this page.`;
}

/**
 * Set value on an input element with proper event dispatching
 */
function setInputValue(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  fieldLabel: string
): string {
  if (input instanceof HTMLInputElement && input.type === "file") {
    return `SUGGEST: Cannot set value for file input "${fieldLabel}". Please select the file manually.`;
  }

  input.focus();

  // Use native input setter to work with React/Vue
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value"
  )?.set;
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, "value"
  )?.set;
  const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype, "value"
  )?.set;

  if (input.tagName === "TEXTAREA" && nativeTextAreaValueSetter) {
    nativeTextAreaValueSetter.call(input, value);
  } else if (input.tagName === "SELECT" && nativeSelectValueSetter) {
    nativeSelectValueSetter.call(input, value);
  } else if (input.tagName === "INPUT" && nativeInputValueSetter) {
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
  // Strategy 1: Chat Interfaces (Press Enter or click nearby Send icon)
  let targetInput = document.activeElement as HTMLElement | null;
  if (!targetInput || !isEditableElement(targetInput)) {
    targetInput = lastFocusedInput;
  }
  
  if (targetInput && document.contains(targetInput) && isEditableElement(targetInput)) {
    // Look for an obvious send button near the input
    const parent = targetInput.closest('div, form');
    if (parent) {
      const sendBtn = parent.querySelector<HTMLElement>(
        'button[type="submit"], button[aria-label*="end" i], button[aria-label*="ubmit" i], button svg, [aria-label*="end message" i]'
      );
      if (sendBtn) {
        const actualBtn = sendBtn.closest('button, [role="button"]') as HTMLElement || sendBtn;
        highlightElement(actualBtn);
        setTimeout(() => actualBtn.click(), 100);
        return "Clicked the send button.";
      }
    }

    // If no obvious button, perfectly simulate pressing Enter
    targetInput.focus();
    const enterEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      code: "Enter",
      keyCode: 13,
    });
    targetInput.dispatchEvent(enterEvent);
    
    // Some frameworks listen to keyup instead
    const keyupEvent = new KeyboardEvent("keyup", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      code: "Enter",
      keyCode: 13,
    });
    targetInput.dispatchEvent(keyupEvent);
    
    return "Pressed Enter to send.";
  }

  // Strategy 2: Standard HTML Forms
  if (targetInput) {
    const form = targetInput.closest("form");
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
