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
