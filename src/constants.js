export const STAGES = [
  { key: "sent_to_purchaser",   label: "Sent to Purchaser",   color: "#3b82f6", icon: "✉" },
  { key: "ordered",             label: "Ordered",             color: "#f59e0b", icon: "🛒" },
  { key: "partially_shipped",   label: "Partially Shipped",   color: "#f97316", icon: "📦" },
  { key: "shipped",             label: "Shipped",             color: "#8b5cf6", icon: "🚚" },
  { key: "partially_delivered", label: "Partially Delivered", color: "#06b6d4", icon: "📬" },
  { key: "delivered",           label: "Delivered",           color: "#22c55e", icon: "✓" },
  { key: "completed",           label: "Completed",           color: "#10b981", icon: "✅" },
];

// Which statuses count as "delivered" for reporting / archive eligibility
export const DELIVERED_STATUSES = new Set(["delivered", "completed"]);

// Sync boolean flags from status (used server-side; mirrored here for reference)
export function statusToBooleans(status) {
  const after = (key) => {
    const stageKeys = STAGES.map(s => s.key);
    const idx = stageKeys.indexOf(status);
    const keyIdx = stageKeys.indexOf(key);
    return idx >= keyIdx;
  };
  return {
    email_sent:    after("sent_to_purchaser") ? 1 : 0,
    email_replied: after("ordered")           ? 1 : 0,
    followup:      after("partially_shipped") ? 1 : 0,
    delivered:     after("delivered")         ? 1 : 0,
  };
}
