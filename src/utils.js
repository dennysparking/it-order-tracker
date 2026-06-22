import { STAGES } from './constants';

export function daysSince(dateStr) {
  return Math.floor((new Date() - new Date(dateStr)) / 86400000);
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function getCurrentStage(order) {
  if (!order.status) return 0; // default to Requested
  const idx = STAGES.findIndex(s => s.key === order.status);
  return idx >= 0 ? idx : 0;
}

// Roll a bulk order's parent status up from its sub-items (mirrors the server logic so the
// detail modal can reflect changes instantly without a round-trip).
export function rollupStatus(items) {
  if (!items || !items.length) return null;
  const keys = STAGES.map(s => s.key);
  const idxs = items.map(it => { const i = keys.indexOf(it.status); return i < 0 ? 0 : i; });
  const min = Math.min(...idxs), max = Math.max(...idxs);
  const dIdx = keys.indexOf("delivered"), shIdx = keys.indexOf("shipped");
  if (min === max) return keys[min];
  if (min >= dIdx) return "delivered";
  if (max >= dIdx) return "partially_delivered";
  if (max >= shIdx) return "partially_shipped";
  return keys[min];
}

export function isValidUrl(str) {
  if (!str) return false;
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const EMOJI_MAP = [
  { keywords: ['monitor', 'display', 'screen'], emoji: '\u{1F5A5}\uFE0F' },
  { keywords: ['laptop', 'notebook'], emoji: '\uD83D\uDCBB' },
  { keywords: ['camera'], emoji: '\uD83D\uDCF7' },
  { keywords: ['tv', 'television'], emoji: '\uD83D\uDCFA' },
  { keywords: ['dock', 'docking'], emoji: '\uD83D\uDD0C' },
  { keywords: ['keyboard'], emoji: '\u2328\uFE0F' },
  { keywords: ['mouse', 'mice'], emoji: '\uD83D\uDDB1\uFE0F' },
  { keywords: ['cart'], emoji: '\uD83D\uDED2' },
  { keywords: ['printer', 'print'], emoji: '\uD83D\uDDA8\uFE0F' },
  { keywords: ['phone', 'telephone', 'mobile'], emoji: '\uD83D\uDCF1' },
  { keywords: ['headset', 'headphone'], emoji: '\uD83C\uDFA7' },
  { keywords: ['speaker'], emoji: '\uD83D\uDD0A' },
  { keywords: ['cpu', 'processor', 'server'], emoji: '\u2699\uFE0F' },
  { keywords: ['lockbox', 'lock', 'key'], emoji: '\uD83D\uDD10' },
  { keywords: ['building', 'office'], emoji: '\uD83C\uDFE2' },
  { keywords: ['cable', 'cord', 'wire', 'adapter'], emoji: '\uD83D\uDD0C' },
  { keywords: ['chair', 'seat'], emoji: '\uD83E\uDE91' },
  { keywords: ['desk', 'table', 'stand'], emoji: '\uD83E\uDE91' },
  { keywords: ['usb', 'flash', 'drive', 'storage', 'hard drive', 'ssd'], emoji: '\uD83D\uDCBE' },
  { keywords: ['battery', 'charger', 'power'], emoji: '\uD83D\uDD0B' },
];

export function getItemEmoji(name) {
  if (!name) return '\uD83D\uDCE6';
  const lower = name.toLowerCase();
  for (const entry of EMOJI_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.emoji;
    }
  }
  return '\uD83D\uDCE6';
}

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export function formatCurrency(value) {
  if (value == null || value === '' || isNaN(value)) return '';
  return currencyFmt.format(value);
}

// Escape text for safe interpolation into an HTML email body.
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Turn a finished plaintext email body into HTML: escape it, linkify any http(s) URL
// into a real <a> tag (so it's clickable in new Outlook, which won't auto-linkify plain
// text), and preserve line breaks. The email body is always derived from `text`, so the
// HTML and plaintext versions stay in sync.
function plaintextToHtml(text) {
  const escaped = escapeHtml(text);
  // Escaping ran first, so "&" in query strings is already "&amp;" — valid inside href.
  const linked = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1a1a1a;">${linked.replace(/\n/g, "<br>")}</div>`;
}

function mailtoUrl(toEmail, subject, body, ccEmails = []) {
  let url = `mailto:${toEmail || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (ccEmails.length) url += `&cc=${encodeURIComponent(ccEmails.join(";"))}`;
  return url;
}

// Copy both an HTML and a plaintext flavor to the clipboard. Uses the async Clipboard
// API in secure contexts (localhost/HTTPS); falls back to execCommand for plain-HTTP LAN
// deployments where navigator.clipboard is unavailable. Must run inside a user gesture.
export function copyRichText(html, text) {
  if (window.isSecureContext && navigator.clipboard && window.ClipboardItem) {
    try {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      });
      return navigator.clipboard.write([item]).then(() => true).catch(() => execCommandCopy(html, text));
    } catch {
      return Promise.resolve(execCommandCopy(html, text));
    }
  }
  return Promise.resolve(execCommandCopy(html, text));
}

function execCommandCopy(html, text) {
  const handler = (e) => {
    e.clipboardData.setData("text/html", html);
    e.clipboardData.setData("text/plain", text);
    e.preventDefault();
  };
  document.addEventListener("copy", handler);
  let ok = false;
  try {
    // A selected node is needed for execCommand('copy') to fire the copy event.
    const span = document.createElement("span");
    span.textContent = text;
    span.style.position = "fixed";
    span.style.left = "-9999px";
    span.style.opacity = "0";
    document.body.appendChild(span);
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(range);
    ok = document.execCommand("copy");
    sel.removeAllRanges();
    document.body.removeChild(span);
  } catch {
    ok = false;
  }
  document.removeEventListener("copy", handler);
  return ok;
}

// A manual follow-up nudge to the order's recipients asking for a status update.
// Returns { subject, text, html, mailto }: `text`/`mailto` drive the Outlook draft,
// `html` is the clickable-link version copied to the clipboard.
export function buildFollowupMailtoLink(order, toEmail, ccEmails = []) {
  const subject = `Follow-up: ${order.name}`;
  let text = `Hi,\n\nFollowing up on the IT order below — could you let us know the current status?\n\nItem: ${order.name}\nQuantity: ${order.quantity || 1}\n`;
  // URL on its own line so mail clients reliably turn it into a clickable link.
  if (order.link) text += `Link:\n${order.link}\n`;
  if (order.notes) text += `Notes: ${order.notes}\n`;
  text += `\nThank you.`;
  return { subject, text, html: plaintextToHtml(text), mailto: mailtoUrl(toEmail, subject, text, ccEmails) };
}

// Build the initial order-request email. Returns { subject, text, html, mailto } — same
// contract as buildFollowupMailtoLink.
export function buildMailtoLink(order, toEmail, templateSubject, templateBody, ccEmails = [], confirmLink = "") {
  let subject = (templateSubject || "IT Order Request: {{item_name}}")
    .replace("{{item_name}}", order.name);
  const isBulk = Array.isArray(order.bulk_items) && order.bulk_items.length;
  let text;

  if (isBulk) {
    // Bulk order: present the parent item plus every sub-item as one unified numbered list,
    // rather than promoting the first item to a standalone header.
    const allItems = [
      { name: order.name, link: order.link, quantity: order.quantity, unit_cost: order.unit_cost },
      ...order.bulk_items,
    ];
    const lines = allItems.map((it, i) => {
      const qty = (it.quantity || 1) > 1 ? ` (x${it.quantity})` : "";
      const cost = it.unit_cost != null && it.unit_cost !== "" ? ` - ${formatCurrency(it.unit_cost)}` : "";
      const link = it.link ? `\n   ${it.link}` : "";
      return `${i + 1}. ${it.name}${qty}${cost}${link}`;
    });
    text = `Hi,\n\nPlease process the following IT order:\n\nItems in this order (${allItems.length}):\n${lines.join("\n")}\n`;
    if (order.notes) text += `\nNotes: ${order.notes}\n`;
    text += `\nThank you.`;
  } else {
    text = (templateBody || "Hi,\\n\\nPlease process the following IT order:\\n\\nItem: {{item_name}}\\nQuantity: {{quantity}}\\nLink:\\n{{link}}\\n{{notes}}\\nThank you.")
      .replace("{{item_name}}", order.name)
      .replace("{{quantity}}", order.quantity || 1)
      .replace("{{link}}", order.link || "N/A")
      .replace("{{notes}}", order.notes ? "Notes: " + order.notes + "\\n" : "")
      .replace(/\\n/g, "\n");
  }

  if (confirmLink) {
    const noun = isBulk ? "these items have" : "this item has";
    text += `\n\nPlease click the link below to confirm ${noun} been ordered:\n${confirmLink}`;
  }

  return { subject, text, html: plaintextToHtml(text), mailto: mailtoUrl(toEmail, subject, text, ccEmails) };
}
