import { STAGES } from '../constants';
import { S } from '../styles';
import { getCurrentStage, daysSince, formatDate, formatCurrency, isValidUrl } from '../utils';
import ProductImage from './ProductImage';

export default function ListView({ filtered, settings, onAdvance, onRevert, onEdit, onView, selectionMode, selectedIds, onToggleSelect, onSelectAll }) {
  const staleDays = parseInt(settings.stale_days) || 5;
  const allSelected = filtered.length > 0 && filtered.every(o => selectedIds?.has(o.id));

  return (
    <div className="list-table-wrap" style={{ padding: 16, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-primary)" }}>
            {selectionMode && (
              <th style={{ padding: "8px 10px", width: 36 }}>
                <input type="checkbox" checked={allSelected}
                  onChange={() => onSelectAll?.(allSelected ? [] : filtered.map(o => o.id))}
                  style={{ accentColor: "var(--accent)", width: 16, height: 16, cursor: "pointer" }} />
              </th>
            )}
            {["", "Order", "Status", "Category", "Dept", "Qty", "Cost", "Date", "By", "Requested By", ""].map((h, i) => (
              <th key={i} style={{
                ...S.mono, textAlign: "left", padding: "8px 10px", fontSize: 10,
                fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8,
                color: "var(--text-muted)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.sort((a, b) => new Date(b.date) - new Date(a.date)).map(o => {
            const stage = getCurrentStage(o);
            const stale = stage < STAGES.length - 1 && daysSince(o.last_updated || o.date) >= staleDays;
            return (
              <tr key={o.id} style={{
                borderBottom: "1px solid var(--border-subtle)",
                background: selectedIds?.has(o.id) ? "var(--accent-bg)" : stale ? "var(--danger-bg)" : "transparent",
              }}>
                {selectionMode && (
                  <td style={{ padding: "6px 10px", width: 36 }}>
                    <input type="checkbox" checked={!!selectedIds?.has(o.id)}
                      onChange={() => onToggleSelect?.(o.id)}
                      style={{ accentColor: "var(--accent)", width: 16, height: 16, cursor: "pointer" }} />
                  </td>
                )}
                <td style={{ padding: "6px 10px", width: 40 }}>
                  <ProductImage url={o.link} imageUrl={o.image_url} name={o.name} orderId={o.id} size={32} />
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {stale && <span style={{ color: "#ef4444", fontSize: 8 }}>{"\u25cf"}</span>}
                    <span style={{ fontWeight: 600, cursor: "pointer", borderBottom: "1px dashed transparent" }}
                      onClick={() => onView?.(o)}
                      onMouseEnter={e => e.target.style.borderBottomColor = "var(--text-primary)"}
                      onMouseLeave={e => e.target.style.borderBottomColor = "transparent"}>
                      {o.name}
                    </span>
                    {isValidUrl(o.link) && <a href={o.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#60a5fa" }}>{"\u2197"}</a>}
                  </div>
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button onClick={() => stage > 0 && onRevert(o.id)} disabled={stage <= 0} title="Move back"
                      style={{ background: "transparent", border: "none", color: "var(--text-dimmed)", cursor: stage > 0 ? "pointer" : "default", fontSize: 14, padding: "0 2px", lineHeight: 1, opacity: stage > 0 ? 1 : 0.3 }}>\u2039</button>
                    <span style={{
                      ...S.mono, fontSize: 10, fontWeight: 600, borderRadius: 999,
                      padding: "2px 7px", background: (STAGES[stage]?.color || "#64748b") + "22",
                      color: STAGES[stage]?.color || "#64748b", border: `1px solid ${(STAGES[stage]?.color || "#64748b")}44`,
                      whiteSpace: "nowrap",
                    }}>{STAGES[stage]?.label || "Sent to Purchaser"}</span>
                    <button onClick={() => stage < STAGES.length - 1 && onAdvance(o.id)} disabled={stage >= STAGES.length - 1} title="Move forward"
                      style={{ background: "transparent", border: "none", color: "var(--text-dimmed)", cursor: stage < STAGES.length - 1 ? "pointer" : "default", fontSize: 14, padding: "0 2px", lineHeight: 1, opacity: stage < STAGES.length - 1 ? 1 : 0.3 }}>\u203a</button>
                  </div>
                </td>
                <td style={{ ...S.mono, padding: "6px 10px", fontSize: 10, color: "var(--accent)" }}>{o.category || "\u2014"}</td>
                <td style={{ ...S.mono, padding: "6px 10px", fontSize: 10, color: "var(--text-secondary)" }}>{o.department || "\u2014"}</td>
                <td style={{ ...S.mono, padding: "6px 10px", fontSize: 12, color: "var(--text-secondary)" }}>{o.quantity || 1}</td>
                <td style={{ ...S.mono, padding: "6px 10px", fontSize: 11, color: "var(--text-secondary)" }}>
                  {o.unit_cost != null ? formatCurrency(o.unit_cost * (o.quantity || 1)) : "\u2014"}
                </td>
                <td style={{ ...S.mono, padding: "6px 10px", fontSize: 11, color: "var(--text-muted)" }}>{formatDate(o.date)}</td>
                <td style={{ ...S.mono, padding: "6px 10px", fontSize: 11, color: "var(--text-dimmed)" }}>{o.created_by}</td>
                <td style={{ ...S.mono, padding: "6px 10px", fontSize: 11, color: "var(--text-dimmed)" }}>{o.requested_by || "\u2014"}</td>
                <td style={{ padding: "6px 8px" }}>
                  <button onClick={() => onEdit(o)} style={{
                    background: "transparent", border: "none", color: "var(--text-dimmed)", cursor: "pointer", fontSize: 11,
                  }}>Edit</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, ...S.mono, color: "var(--text-dimmed)", fontSize: 13 }}>No orders found.</div>
      )}
    </div>
  );
}
