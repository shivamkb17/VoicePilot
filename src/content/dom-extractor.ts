// ─────────────────────────────────────────────
// VoicePilot — DOM Extractor
// Converts live DOM into structured PageContext
// ─────────────────────────────────────────────

import type { PageContext } from "../utils/constants";

/**
 * Extract structured page context from the current DOM.
 * This is the "fast path" — instant, local extraction.
 */
export function extractPageContext(): PageContext {
  return {
    url: window.location.href,
    title: document.title || "",
    metaDescription: getMetaDescription(),
    headings: extractHeadings(),
    sections: extractSections(),
    buttons: extractButtons(),
    links: extractLinks(),
    forms: extractForms(),
    images: document.querySelectorAll("img").length,
    mainContent: extractMainContent(),
  };
}

function getMetaDescription(): string {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="description"]'
  );
  return meta?.content || "";
}

function extractHeadings(): PageContext["headings"] {
  const headings: PageContext["headings"] = [];
  document.querySelectorAll("h1, h2, h3, h4").forEach((el) => {
    const text = el.textContent?.trim();
    if (text) {
      headings.push({
        level: parseInt(el.tagName[1]),
        text: text.slice(0, 200),
      });
    }
  });
  return headings.slice(0, 50); // Cap to avoid huge payloads
}

function extractSections(): PageContext["sections"] {
  const sections: PageContext["sections"] = [];

  // Strategy 1: Use semantic section/article/main elements
  const sectionEls = document.querySelectorAll(
    "section, article, main, [role='main'], [role='region']"
  );

  if (sectionEls.length > 0) {
    sectionEls.forEach((el) => {
      const heading =
        el.querySelector("h1, h2, h3")?.textContent?.trim() || "";
      const text = getVisibleText(el).slice(0, 500);
      if (text.length > 20) {
        sections.push({
          heading,
          text,
          id: el.id || undefined,
        });
      }
    });
  }

  // Strategy 2: Fallback — group by heading hierarchy
  if (sections.length === 0) {
    document.querySelectorAll("h2, h3").forEach((heading) => {
      const text = collectTextUntilNextHeading(heading);
      if (text.length > 20) {
        sections.push({
          heading: heading.textContent?.trim() || "",
          text: text.slice(0, 500),
          id: heading.id || undefined,
        });
      }
    });
  }

  return sections.slice(0, 30);
}

function extractButtons(): PageContext["buttons"] {
  const buttons: PageContext["buttons"] = [];
  const seen = new Set<string>();

  // Native buttons
  document
    .querySelectorAll('button, [role="button"], input[type="submit"]')
    .forEach((el) => {
      const text = getButtonText(el);
      if (text && !seen.has(text.toLowerCase())) {
        seen.add(text.toLowerCase());
        buttons.push({
          text: text.slice(0, 100),
          id: el.id || undefined,
          className: el.className
            ? String(el.className).slice(0, 100)
            : undefined,
        });
      }
    });

  // Links styled as buttons (common pattern)
  document.querySelectorAll("a").forEach((el) => {
    const style = window.getComputedStyle(el);
    const looksLikeButton =
      style.display === "inline-block" ||
      style.display === "flex" ||
      style.borderRadius !== "0px" ||
      el.className.toLowerCase().includes("btn") ||
      el.className.toLowerCase().includes("button") ||
      el.className.toLowerCase().includes("cta");

    if (looksLikeButton) {
      const text = el.textContent?.trim();
      if (text && text.length < 50 && !seen.has(text.toLowerCase())) {
        seen.add(text.toLowerCase());
        buttons.push({
          text,
          id: el.id || undefined,
          className: el.className
            ? String(el.className).slice(0, 100)
            : undefined,
        });
      }
    }
  });

  return buttons.slice(0, 30);
}

function extractLinks(): PageContext["links"] {
  const links: PageContext["links"] = [];
  const seen = new Set<string>();

  document.querySelectorAll("a[href]").forEach((el) => {
    const anchor = el as HTMLAnchorElement;
    const text = anchor.textContent?.trim();
    const href = anchor.href;

    if (text && href && !seen.has(href) && text.length < 100) {
      seen.add(href);
      links.push({ text, href });
    }
  });

  return links.slice(0, 50);
}

function extractForms(): PageContext["forms"] {
  const forms: PageContext["forms"] = [];

  document.querySelectorAll("form").forEach((form) => {
    const inputs: string[] = [];
    form
      .querySelectorAll("input, textarea, select")
      .forEach((input) => {
        const el = input as HTMLInputElement;
        const label =
          el.placeholder ||
          el.name ||
          el.getAttribute("aria-label") ||
          el.type ||
          "unknown";
        inputs.push(label);
      });

    if (inputs.length > 0) {
      forms.push({
        id: form.id || undefined,
        action: form.action || undefined,
        inputs,
      });
    }
  });

  return forms.slice(0, 10);
}

function extractMainContent(): string {
  // Try main content areas first
  const mainEl =
    document.querySelector("main") ||
    document.querySelector('[role="main"]') ||
    document.querySelector("article") ||
    document.body;

  return getVisibleText(mainEl).slice(0, 3000);
}

/**
 * Get visible text content, filtering out hidden elements and scripts
 */
function getVisibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element;

  // Remove non-visible content
  clone
    .querySelectorAll(
      "script, style, noscript, svg, [aria-hidden='true'], [hidden]"
    )
    .forEach((el) => el.remove());

  const text = clone.textContent || "";
  // Collapse whitespace
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Get button text from various sources
 */
function getButtonText(el: Element): string {
  return (
    el.textContent?.trim() ||
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    (el as HTMLInputElement).value ||
    ""
  );
}

/**
 * Collect text from siblings until the next heading element
 */
function collectTextUntilNextHeading(heading: Element): string {
  let text = "";
  let sibling = heading.nextElementSibling;

  while (sibling && !sibling.matches("h1, h2, h3, h4")) {
    text += " " + (sibling.textContent?.trim() || "");
    sibling = sibling.nextElementSibling;
  }

  return text.replace(/\s+/g, " ").trim();
}
