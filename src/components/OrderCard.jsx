import { STAGES } from '../constants';
import { S } from '../styles';
import { getCurrentStage, daysSince, formatDate, formatCurrency, isValidUrl } from '../utils';
import ProductImage from './ProductImage';

export default function OrderCard({ order, onAdvance, onRevert, onDelete, onEdit, onView, settings, selectionMode, selected, onToggleSelect }) {
  const stage = getCurrentStage(order);
  const stageInfo = STAGES[stage] || STAGES[0];
  const staleDays = parseInt(settings.stale_days) || 5;
  const stale = stage < STAGES.length - 1 && daysSince(order.last_updated || order.date) >= staleDays;

  const handleClick = () => {
    if (selectionMode) onToggleSelect?.(order.id);
    else onView?.(order);
  };

  const handleDragStart = (e) => {
    if (selectionMode) { e.preventDefault(); return; }
    e.dataTransfer.setData("orderId", order.id);
    e.dataTransfer.effectAllowed = "move";
    e.currentTarget.style.opacity = "0.5";
  };

  return (
    <div
      draggable={!selectionMode}
      onDragStart={handleDragStart}
      onDragEnd={e => { e.currentTarget.style.opacity = "1"; }}
      onClick={handleClick}
      onMouseEnter={e => { if (!selectionMode) { e.currentTarget.style.boxShadow = "var(--shadow-card-hover)"; e.currentTarget.style.borderColor = "var(--border-input)"; } }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "var(--shadow-card)"; e.currentTarget.style.borderColor = stale ? "var(--danger-border)" : selected ? "var(--accent)" : "var(--border-primary)"; }}
      style={{
        background: stale ? "var(--danger-bg)" : "var(--bg-card)",
        border: selected ? "1px solid var(--accent)" : stale ? "1px solid var(--danger-border)" : "1px solid var(--border-primary)",
        borderRadius: 10, padding: "12px 14px 12px 18px", marginBottom: 6,
        cursor: selectionMode ? "pointer" : "grab",
        transition: "all 0.15s ease", position: "relative", overflow: "hidden",
        opacity: selected ? 0.85 : 1, boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Status-colored left edge for at-a-glance scanning */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: stageInfo.color }} />

      {stale && (
        <div style={{
          position: "absolute", top: 0, right: 0, background: "#ef4444", color: "#fff",
          fontSize: 9, fontWeight: 700, letterSpacing: 0.8, padding: "2px 8px 2px 10px",
          borderRadius: "0 9px 0 6px", ...S.mono,
        }}>STALE · {daysSince(order.last_updated || order.date)}d</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {selectionMode && (
          <input type="checkbox" checked={!!selected} onChange={() => onToggleSelect?.(order.id)}
            onClick={e => e.stopPropagation()}
            style={{ accentColor: "var(--accent)", width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
        )}
        <ProductImage url={order.link} imageUrl={order.image_url} name={order.name} orderId={order.id} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {order.name}
            </span>
            {order.quantity > 1 && (
              <span style={{ ...S.mono, fontSize: 10, background: "var(--bg-hover)", borderRadius: 4, padding: "1px 5px", color: "var(--text-secondary)", flexShrink: 0 }}>
                x{order.quantity}
              </span>
            )}
            {order.is_bulk ? (
              <span style={{ ...S.mono, fontSize: 9, background: "#7c3aed22", borderRadius: 4, padding: "1px 6px", color: "#a78bfa", flexShrink: 0 }}>
                BULK
              </span>
            ) : null}
            {order.category && (
              <span style={{ ...S.mono, fontSize: 9, background: "var(--accent-bg)", borderRadius: 4, padding: "1px 6px", color: "var(--accent)", flexShrink: 0 }}>
                {order.category}
              </span>
            )}
            {isValidUrl(order.link) && (
              <a href={order.link} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 10, color: "#60a5fa", flexShrink: 0 }}>↗</a>
            )}
          </div>
          <div style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            {formatDate(order.date)} · {daysSince(order.date)}d ago
            {order.vendor && <span> · {order.vendor}</span>}
            {order.created_by && <span> · {order.created_by}</span>}
            {order.requested_by && <span> · for {order.requested_by}</span>}
            {order.unit_cost != null && <span> · {formatCurrency(order.unit_cost * (order.quantity || 1))}</span>}
          </div>
        </div>
      </div>

      {/* Status progress bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
        <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--border-primary)", position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${((stage + 1) / STAGES.length) * 100}%`,
            background: stageInfo.color, borderRadius: 2, transition: "width 0.3s",
          }} />
        </div>
        <span style={{ ...S.mono, fontSize: 9, color: stageInfo.color, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
          {stageInfo.label}
        </span>
      </div>
    </div>
  );
}
