import { consumeReveal, peekReveal } from "./reveal-store.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderCancelPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Checkout canceled</title>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.5}
a{color:#5469d4}</style></head>
<body>
  <h1>Checkout canceled</h1>
  <p>No charge was made. You can retry anytime via <code>POST /billing/checkout</code> with a pack of <code>starter</code>, <code>standard</code>, or <code>pro</code>.</p>
</body></html>`;
}

export function renderSuccessPage(sessionId: string | undefined): string {
  if (!sessionId) {
    return page(
      "Missing session",
      `<p>No <code>session_id</code> query param. Return from Stripe Checkout with <code>?session_id={CHECKOUT_SESSION_ID}</code>.</p>`,
    );
  }

  // Brief wait path: if webhook has not landed yet, peek may miss — caller can refresh.
  const peeked = peekReveal(sessionId);
  if (!peeked) {
    return page(
      "Processing payment…",
      `<p>We have not finished fulfilling session <code>${escapeHtml(sessionId)}</code> yet (webhook may still be in flight).</p>
       <p><a href="?session_id=${encodeURIComponent(sessionId)}">Refresh</a> in a moment.</p>`,
    );
  }

  const consumed = consumeReveal(sessionId);
  if (consumed.status === "already_revealed") {
    return page(
      "Key already revealed",
      `<p>Credits: <strong>${peeked.creditsCents}</strong> cents (${escapeHtml(peeked.pack)} pack).</p>
       <p>Your API key was already shown once and cannot be re-displayed. If you lost it, purchase another pack (existing active key is reused) or contact ops with break-glass access.</p>
       <p>Key prefix: <code>${escapeHtml(peeked.keyPrefix)}…</code></p>`,
    );
  }

  const keyBlock =
    consumed.plaintextKey != null
      ? `<p><strong>Your API key</strong> (copy now — shown once):</p>
         <pre style="background:#f4f4f5;padding:1rem;overflow:auto">${escapeHtml(consumed.plaintextKey)}</pre>
         <p>Use as <code>Authorization: Bearer …</code> or <code>X-API-Key</code>.</p>`
      : `<p>Credits applied. You already have an active API key (prefix <code>${escapeHtml(peeked.keyPrefix)}…</code>); it was reused — plaintext is not re-shown.</p>`;

  return page(
    "Payment successful",
    `<p>Added <strong>${peeked.creditsCents}</strong> credit cents (<code>${escapeHtml(peeked.pack)}</code> pack).</p>
     ${keyBlock}`,
  );
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.5}
pre{word-break:break-all}code{font-size:0.95em}</style></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body></html>`;
}
