/**
 * Provider barrel. Parallel/Exa keys are unused in v0.
 */

import { liveResearchEnabled } from "../live.js";
import { LocalHttpProvider } from "./local.js";
import type { ResearchProvider } from "./types.js";

export type { ExtractedPage, ResearchProvider, SynthesizeInput, SynthesizeOutput } from "./types.js";
export { MockProvider, defaultMockPages } from "./mock.js";
export { LocalHttpProvider } from "./local.js";

/**
 * Production default. LIVE_RESEARCH=1 → local HTTP search+extract (no vendor APIs).
 * PARALLEL_API_KEY / EXA_API_KEY are placeholders and must not enable a vendor path.
 */
export function defaultResearchProvider(): ResearchProvider | null {
  if (liveResearchEnabled()) return new LocalHttpProvider();
  return null;
}
