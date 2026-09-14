/**
 * Optional live path for research_brief when LIVE_RESEARCH=1 and depth=quick.
 * Falls back to sample on any failure. Documented in README.
 *
 * Snippet-only DuckDuckGo leads: confidence low, billable=false (not bar-passing).
 */

import { AS_OF, type ResearchBriefResult, type Source } from "../types.js";

export function liveResearchEnabled(): boolean {
  return process.env.LIVE_RESEARCH === "1";
}

export async function tryLiveBriefQuick(query: string): Promise<ResearchBriefResult | null> {
  if (!liveResearchEnabled()) return null;

  try {
    // Simple DuckDuckGo HTML search (no API key). Best-effort only.
    const q = encodeURIComponent(query.slice(0, 200));
    const url = `https://html.duckduckgo.com/html/?q=${q}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "research-mcp/0.1 (+live-research)" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();

    const sources: Source[] = [];
    const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null && sources.length < 4) {
      const href = decodeDuckRedirect(m[1]);
      const title = stripTags(m[2]).slice(0, 200);
      if (!href.startsWith("http")) continue;
      sources.push({
        title: title || href,
        url: href,
        publisher: hostname(href),
        accessed: AS_OF,
        type: "secondary",
        supports:
          "Search hit from live DuckDuckGo HTML (snippet-level; page not fully fetched)",
      });
    }

    if (sources.length < 2) return null;

    return {
      query,
      depth: "quick",
      tldr: `Live quick search returned ${sources.length} result link(s) for the query. Treat as low-confidence leads (search snippets, not full-page fetches). Not charged as research.`,
      body: {
        mode: "live",
        billable: false,
        note: "Pages behind these URLs were not fully fetched in v0 live path. Snippet-only leads are not quality-bar-passing.",
        query,
      },
      confidence: "low",
      sources,
      gaps: [
        "Live path used search snippets only; fetch and quote primaries before raising confidence.",
        "Snippet-only live path — not charged as research (billable=false).",
      ],
      as_of: AS_OF,
      // Snippet-only is not quality-bar-passing → no charge
      meta: { mode: "live", billable: false },
    };
  } catch {
    return null;
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function hostname(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "unknown";
  }
}

function decodeDuckRedirect(href: string): string {
  try {
    const u = new URL(href, "https://html.duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return href;
  } catch {
    return href;
  }
}
