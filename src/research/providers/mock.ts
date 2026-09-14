/**
 * In-process mock provider: no network, no API keys.
 */

import type { ExtractedPage, ResearchProvider } from "./types.js";

export interface MockProviderOptions {
  pages?: ExtractedPage[];
  searchImpl?: (query: string) => Promise<string[]>;
  extractImpl?: (url: string) => Promise<ExtractedPage>;
}

const FILLER =
  "This official page restates the topic for implementers and decision-makers. " +
  "It covers purpose, current status, and implications without marketing install counts. ";

export function defaultMockPages(query = "the research topic"): ExtractedPage[] {
  const q = query.slice(0, 120);
  const body = (lead: string) =>
    `${lead} Query context: ${q}. Published for the 2026 research set. ` + FILLER.repeat(6);

  // URLs use primary allowlist hosts so density + quote gate can pass under the
  // tightened classifySourceType heuristic (quotes taken from page sentences).
  return [
    {
      url: "https://modelcontextprotocol.io/specification/2026-03-15",
      title: "Official specification",
      publisher: "modelcontextprotocol.io",
      date: "2026-03-15",
      text: body(
        "Official specification published 2026-03-15. Defines roles, transports, and versioning.",
      ),
    },
    {
      url: "https://www.anthropic.com/news/topic-2026",
      title: "First-party press announcement",
      publisher: "Anthropic",
      date: "2026-01-20",
      text: body(
        "First-party press announcement dated 2026-01-20. Names the originating organization.",
      ),
    },
    {
      url: "https://github.com/modelcontextprotocol/topic",
      title: "Canonical source repository",
      publisher: "GitHub",
      date: "2026-02-01",
      text: body(
        "Canonical source repository README dated 2026-02-01. Primary implementation home.",
      ),
    },
    {
      url: "https://a2a-protocol.org/latest/specification/",
      title: "A2A protocol specification",
      publisher: "a2a-protocol.org",
      date: "2026-04-02",
      text: body(
        "A2A protocol specification updated 2026-04-02. Hosts, clients, and servers.",
      ),
    },
    {
      url: "https://roundup.blog.example/topic-q3",
      title: "Secondary roundup",
      publisher: "Roundup Blog",
      date: "2026-05-10",
      text: body(
        "Secondary roundup dated 2026-05-10. Points back at the specification and press note.",
      ),
    },
  ];
}

export class MockProvider implements ResearchProvider {
  readonly id = "mock";
  searchCalls = 0;
  extractCalls = 0;
  searchedQueries: string[] = [];
  extractedUrls: string[] = [];
  private pages: ExtractedPage[];
  private searchImpl?: MockProviderOptions["searchImpl"];
  private extractImpl?: MockProviderOptions["extractImpl"];

  constructor(opts: MockProviderOptions = {}) {
    this.pages = opts.pages ?? defaultMockPages();
    this.searchImpl = opts.searchImpl;
    this.extractImpl = opts.extractImpl;
  }

  async search(query: string): Promise<string[]> {
    this.searchCalls += 1;
    this.searchedQueries.push(query);
    if (this.searchImpl) return this.searchImpl(query);
    return this.pages.map((p) => p.url);
  }

  async fetchExtract(url: string): Promise<ExtractedPage> {
    this.extractCalls += 1;
    this.extractedUrls.push(url);
    if (this.extractImpl) return this.extractImpl(url);
    const page = this.pages.find((p) => p.url === url);
    if (!page) {
      throw new Error(`mock fetchExtract miss: ${url}`);
    }
    return { ...page };
  }
}
