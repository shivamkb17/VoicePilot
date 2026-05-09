// ─────────────────────────────────────────────
// VoicePilot — Firecrawl Scraping Service
// Deep page extraction for complex/SPA sites
// ─────────────────────────────────────────────

export interface FirecrawlResult {
  markdown: string;
  metadata: {
    title?: string;
    description?: string;
    language?: string;
    sourceURL?: string;
  };
}

/**
 * Scrape a URL using the Firecrawl API
 */
export async function scrapePage(
  url: string,
  apiKey: string,
  proxyUrl?: string
): Promise<FirecrawlResult> {
  const endpoint = proxyUrl
    ? `${proxyUrl}/api/scrape`
    : "https://api.firecrawl.dev/v1/scrape";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!proxyUrl) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Firecrawl API error: ${response.status} — ${error}`);
  }

  const data = await response.json();

  return {
    markdown: data.data?.markdown || "",
    metadata: {
      title: data.data?.metadata?.title,
      description: data.data?.metadata?.description,
      language: data.data?.metadata?.language,
      sourceURL: data.data?.metadata?.sourceURL,
    },
  };
}
