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

export function buildMailtoLink(order, toEmail, templateSubject, templateBody, ccEmails = [], confirmLink = "") {
  let subject = (templateSubject || "IT Order Request: {{item_name}}")
    .replace("{{item_name}}", order.name);
  const isBulk = Array.isArray(order.bulk_items) && order.bulk_items.length;
  let body;

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
    body = `Hi,\n\nPlease process the following IT order:\n\nItems in this order (${allItems.length}):\n${lines.join("\n")}\n`;
    if (order.notes) body += `\nNotes: ${order.notes}\n`;
    body += `\nThank you.`;
  } else {
    body = (templateBody || "Hi,\\n\\nPlease process the following IT order:\\n\\nItem: {{item_name}}\\nQuantity: {{quantity}}\\nLink: {{link}}\\n{{notes}}\\nThank you.")
      .replace("{{item_name}}", order.name)
      .replace("{{quantity}}", order.quantity || 1)
      .replace("{{link}}", order.link || "N/A")
      .replace("{{notes}}", order.notes ? "Notes: " + order.notes + "\\n" : "")
      .replace(/\\n/g, "\n");
  }

  if (confirmLink) {
    const noun = isBulk ? "these items have" : "this item has";
    body += `\n\nPlease click the link below to confirm ${noun} been ordered:\n${confirmLink}`;
  }

  let url = `mailto:${toEmail || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (ccEmails.length) url += `&cc=${encodeURIComponent(ccEmails.join(";"))}`;
  return url;
}
