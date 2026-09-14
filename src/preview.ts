/**
 * Preview / parked tools gate (P0 finish-or-hide).
 *
 * Default (flag off): live paid surface is research_brief (quick|standard) +
 * source_lookup only. compare_options is not registered; depth=deep rejected.
 *
 * ENABLE_PREVIEW_TOOLS=1: register compare_options as preview and allow
 * depth=deep. Both preview paths are always billable=false / $0 and must
 * never soft-reserve a full SKU.
 */

export const PREVIEW_TOOLS_ENV = "ENABLE_PREVIEW_TOOLS";

export function isPreviewToolsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[PREVIEW_TOOLS_ENV]?.trim() === "1";
}

/** Depths advertised on research_brief inputSchema. */
export function researchBriefDepthEnum(
  env: NodeJS.ProcessEnv = process.env,
): readonly ["quick", "standard"] | readonly ["quick", "standard", "deep"] {
  return isPreviewToolsEnabled(env)
    ? (["quick", "standard", "deep"] as const)
    : (["quick", "standard"] as const);
}

export function previewDeepRejectedMessage(): string {
  return (
    "depth=deep is a preview path and is not registered unless " +
    `${PREVIEW_TOOLS_ENV}=1. Use depth=quick or depth=standard, or enable ` +
    "preview tools (always billable=false / $0)."
  );
}
