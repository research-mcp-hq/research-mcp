/**
 * LIVE_RESEARCH=1 enables the live brief pipeline (search → extract → synthesize)
 * for depth=quick|standard via LocalHttpProvider. Snippet-only DDG path removed.
 * Parallel/Exa keys are unused.
 */

export function liveResearchEnabled(): boolean {
  return process.env.LIVE_RESEARCH === "1";
}
