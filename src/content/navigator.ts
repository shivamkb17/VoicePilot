// ─────────────────────────────────────────────
// VoicePilot — Navigation Engine
// Executes voice-driven navigation actions on the page
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
 * Navigate to a section by searching headings and sections
 */
export function navigateToSection(target: string): string {
  const normalizedTarget = target.toLowerCase().trim();

  // Strategy 1: Find by ID or anchor
  const byId = document.getElementById(normalizedTarget);
  if (byId) {
    byId.scrollIntoView({ behavior: "smooth", block: "start" });
    return `Navigated to the "${target}" section.`;
  }

  // Strategy 2: Find by heading text (fuzzy match)
  const headings = document.querySelectorAll("h1, h2, h3, h4, h5");
  for (const heading of headings) {
    const text = heading.textContent?.toLowerCase().trim() || "";
    if (text.includes(normalizedTarget) || normalizedTarget.includes(text)) {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
      return `Found and navigated to "${heading.textContent?.trim()}".`;
    }
  }

  // Strategy 3: Find by section/landmark
  const sections = document.querySelectorAll(
    "section, article, [role='region']"
  );
  for (const section of sections) {
    const sectionHeading = section.querySelector("h1, h2, h3");
    const text = sectionHeading?.textContent?.toLowerCase().trim() || "";
    const ariaLabel =
      section.getAttribute("aria-label")?.toLowerCase() || "";
    const id = section.id?.toLowerCase() || "";

    if (
      text.includes(normalizedTarget) ||
      ariaLabel.includes(normalizedTarget) ||
      id.includes(normalizedTarget)
    ) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      return `Navigated to the "${sectionHeading?.textContent?.trim() || target}" section.`;
    }
  }

  // Strategy 4: Find by link text in navigation
  const navLinks = document.querySelectorAll("nav a, header a");
  for (const link of navLinks) {
    const text = link.textContent?.toLowerCase().trim() || "";
    if (text.includes(normalizedTarget)) {
      const href = (link as HTMLAnchorElement).href;
      // If it's an anchor link, scroll to it
      if (href.includes("#")) {
        const anchor = href.split("#")[1];
        const target = document.getElementById(anchor);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          return `Navigated to "${link.textContent?.trim()}".`;
        }
      }
      // Otherwise click the link
      (link as HTMLElement).click();
      return `Clicked navigation link "${link.textContent?.trim()}".`;
    }
  }

  return `Could not find a section matching "${target}". Try being more specific.`;
}

/**
 * Click an element by matching its text content
 */
export function clickElement(target: string): string {
  const normalizedTarget = target.toLowerCase().trim();

  // Search buttons first
  const clickables = document.querySelectorAll(
    'button, [role="button"], a, input[type="submit"], input[type="button"]'
  );

  let bestMatch: Element | null = null;
  let bestScore = 0;

  for (const el of clickables) {
    const text =
      el.textContent?.toLowerCase().trim() ||
      (el as HTMLInputElement).value?.toLowerCase() ||
      el.getAttribute("aria-label")?.toLowerCase() ||
      "";

    if (!text) continue;

    // Exact match
    if (text === normalizedTarget) {
      bestMatch = el;
      bestScore = 100;
      break;
    }

    // Contains match
    if (text.includes(normalizedTarget) || normalizedTarget.includes(text)) {
      const score = normalizedTarget.length / Math.max(text.length, 1);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = el;
      }
    }
  }

  if (bestMatch) {
    // Highlight briefly before clicking
    const original = (bestMatch as HTMLElement).style.outline;
    (bestMatch as HTMLElement).style.outline = "3px solid #6366f1";
    (bestMatch as HTMLElement).style.outlineOffset = "2px";

    setTimeout(() => {
      (bestMatch as HTMLElement).style.outline = original;
      (bestMatch as HTMLElement).style.outlineOffset = "";
      (bestMatch as HTMLElement).click();
    }, 400);

    const label =
      bestMatch.textContent?.trim() ||
      (bestMatch as HTMLInputElement).value ||
      target;
    return `Clicking "${label}".`;
  }

  return `Could not find a clickable element matching "${target}".`;
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
