import { useEffect, useState } from 'react';

const STAGES = [
  { key: "email_sent",    label: "Email Sent",        color: "#3b82f6" },
  { key: "email_replied", label: "Confirmed Ordered",  color: "#f59e0b" },
  { key: "followup",      label: "Follow-up",          color: "#a855f7" },
  { key: "delivered",     label: "Delivered",          color: "#22c55e" },
];

// Who can receive a package on behalf of the office.
const RECEIVERS = ["Tami", "Desiree", "Stacey"];

function getStage(order) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (order[STAGES[i].key]) return STAGES[i];
  }
  return { label: "Pending", color: "#64748b" };
}

function formatCurrency(v) {
  if (v == null || v === "") return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

// ── Delivery Modal ──────────────────────────────────────────────────────
function DeliverModal({ order, onConfirm, onCancel }) {
  const [receivedBy, setReceivedBy] = useState("");   // selected name, or "Other"
  const [otherName, setOtherName] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const resolvedReceiver = receivedBy === "Other" ? otherName.trim() : receivedBy;
  const canConfirm = !!resolvedReceiver && !saving;

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) { setPhoto(null); setPhotoPreview(null); return; }
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    await onConfirm({ receivedBy: resolvedReceiver, note, photo });
    setSaving(false);
  };

  const chip = (active) => ({
    padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--border-input)"}`,
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : "var(--text-secondary)",
  });

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 999, padding: 16,
    }}>
      <div className="modal-box" style={{
        background: "var(--bg-modal)", border: "1px solid var(--border-primary)", borderRadius: 16,
        padding: 28, width: "100%", maxWidth: 460, boxShadow: "var(--shadow-modal)",
      }}>
        <h3 style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
          Mark as Delivered
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>
          <strong style={{ color: "var(--text-primary)" }}>{order.name}</strong>
        </p>

        {/* Received by — required */}
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Received by <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: otherName !== null && receivedBy === "Other" ? 8 : 0 }}>
          {RECEIVERS.map(n => (
            <button key={n} type="button" onClick={() => setReceivedBy(n)} style={chip(receivedBy === n)}>{n}</button>
          ))}
          <button type="button" onClick={() => setReceivedBy("Other")} style={chip(receivedBy === "Other")}>Other</button>
        </div>
        {receivedBy === "Other" && (
          <input value={otherName} onChange={e => setOtherName(e.target.value)} autoFocus
            placeholder="Who received it?"
            style={{ width: "100%", marginTop: 8, background: "var(--bg-input)", border: "1px solid var(--border-input)",
              borderRadius: 8, color: "var(--text-primary)", fontSize: 14, padding: "10px 12px", boxSizing: "border-box" }} />
        )}

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Delivery Notes <span style={{ color: "var(--text-dimmed)", fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={"Where was it placed? Any other details..."}
          style={{
            width: "100%", minHeight: 80, background: "var(--bg-input)", border: "1px solid var(--border-input)",
            borderRadius: 8, color: "var(--text-primary)", fontSize: 14, padding: "10px 12px",
            resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
          }}
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Photo <span style={{ color: "var(--text-dimmed)", fontWeight: 400 }}>(optional)</span>
        </label>
        {photoPreview ? (
          <div style={{ position: "relative", marginBottom: 4 }}>
            <img src={photoPreview} alt="" style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 8, background: "var(--bg-input)" }} />
            <button type="button" onClick={() => { setPhoto(null); setPhotoPreview(null); }}
              style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "#fff",
                border: "1px solid var(--border-primary)", borderRadius: 999, width: 28, height: 28, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>
              ×
            </button>
          </div>
        ) : (
          <label style={{ display: "block", background: "var(--bg-input)", border: "1px dashed var(--border-input)", borderRadius: 8,
            padding: "16px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} style={{ display: "none" }} />
            📷 Take or choose a photo
          </label>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{
            flex: 1, background: "transparent", border: "1px solid var(--border-input)",
            color: "var(--text-secondary)", borderRadius: 8, padding: "12px 0", fontSize: 14,
            cursor: "pointer", fontWeight: 500,
          }}>Cancel</button>
          <button onClick={handleConfirm} disabled={!canConfirm} style={{
            flex: 2, background: canConfirm ? "#22c55e" : "#166534", border: "none",
            color: "#fff", borderRadius: 8, padding: "12px 0", fontSize: 14,
            cursor: canConfirm ? "pointer" : "not-allowed", fontWeight: 600, opacity: canConfirm ? 1 : 0.6,
          }}>{saving ? "Saving..." : "Confirm Delivered"}</button>
        </div>
        {!resolvedReceiver && (
          <p style={{ fontSize: 11, color: "var(--text-dimmed)", marginTop: 8, textAlign: "center" }}>Select who received it to continue.</p>
        )}
      </div>
    </div>
  );
}

// ── Order Card ───────────────────────────────────────────────────────────────
function OrderCard({ order, onDeliver }) {
  const stage = getStage(order);
  const price = formatCurrency(order.unit_cost);
  const totalPrice = order.unit_cost && order.quantity > 1
    ? formatCurrency(order.unit_cost * order.quantity) : null;

  return (
    <div style={{
      background: order.delivered ? "rgba(34,197,94,0.06)" : "var(--bg-card)",
      border: `1px solid ${order.delivered ? "rgba(34,197,94,0.4)" : "var(--border-primary)"}`,
      borderRadius: 12, padding: 20, marginBottom: 12,
      opacity: order.delivered ? 0.85 : 1,
    }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {order.image_url && (
          <img src={order.image_url} alt=""
            style={{ width: 72, height: 72, borderRadius: 8, objectFit: "cover", background: "#fff", flexShrink: 0 }}
            onError={e => { e.target.style.display = "none"; }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, wordBreak: "break-word" }}>
            {order.name}
          </div>

          <span style={{
            display: "inline-block", borderRadius: 999,
            padding: "3px 10px", fontSize: 11, fontWeight: 600, marginBottom: 10,
            background: stage.color + "22", color: stage.color, border: `1px solid ${stage.color}44`,
          }}>
            {stage.label}
          </span>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 12, color: "var(--text-muted)", marginBottom: order.notes || order.link ? 8 : 0 }}>
            {order.recipients && <span>For: <strong style={{ color: "var(--text-secondary)" }}>{order.recipients}</strong></span>}
            {order.quantity > 1 && <span>Qty: <strong style={{ color: "var(--text-secondary)" }}>{order.quantity}</strong></span>}
            {price && <span>Unit: <strong style={{ color: "var(--text-secondary)" }}>{price}</strong></span>}
            {totalPrice && <span>Total: <strong style={{ color: "var(--accent)" }}>{totalPrice}</strong></span>}
            {order.date && <span>Ordered: <strong style={{ color: "var(--text-secondary)" }}>{order.date}</strong></span>}
          </div>

          {order.notes && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8, fontStyle: "italic" }}>
              "{order.notes}"
            </div>
          )}

          {order.link && (
            <a href={order.link} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, color: "var(--accent)", display: "inline-block", marginBottom: 12 }}>
              View product ↗
            </a>
          )}

          {!order.delivered && (
            <div>
              <button onClick={() => onDeliver(order)} style={{
                background: "#22c55e", color: "#fff", border: "none", borderRadius: 8,
                padding: "11px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                width: "100%", maxWidth: 280,
              }}>Mark as Delivered</button>
            </div>
          )}

          {order.delivered && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "#022c22", color: "#22c55e", border: "1px solid #166534",
              borderRadius: 999, padding: "5px 14px", fontSize: 12, fontWeight: 600,
            }}>
              ✓ Delivered{order.received_by ? ` · received by ${order.received_by}` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function RecipientPage() {
  const [orders, setOrders]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [deliveringOrder, setDeliveringOrder] = useState(null);

  useEffect(() => {
    fetch(`/api/receiving`)
      .then(r => r.json())
      .then(data => { setOrders(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleDeliver = async ({ receivedBy, note, photo }) => {
    const order = deliveringOrder;
    setDeliveringOrder(null);
    const form = new FormData();
    if (receivedBy) form.append("received_by", receivedBy);
    if (note) form.append("note", note);
    if (photo) form.append("photo", photo);
    const res = await fetch(`/api/recipient/deliver/${order.id}`, { method: "POST", body: form });
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, delivered: true, received_by: receivedBy } : o));
    }
  };

  const active    = orders.filter(o => !o.delivered);
  const delivered = orders.filter(o => o.delivered);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        .rp-body { max-width: 680px; margin: 0 auto; padding: 20px 16px 48px; }
        @media (max-width: 480px) { .rp-body { padding: 14px 12px 60px; } }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)", fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
        {/* Header */}
        <div style={{
          background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-primary)",
          padding: "16px 20px", display: "flex", alignItems: "center", gap: 14,
          position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(8px)",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%", background: "var(--accent)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff",
          }}>📦</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Receiving</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
              {active.length} outstanding · {delivered.length} delivered
            </div>
          </div>
        </div>

        <div className="rp-body">
          {loading && (
            <div style={{ textAlign: "center", color: "var(--text-dimmed)", padding: "60px 0", fontSize: 15 }}>
              Loading orders...
            </div>
          )}

          {!loading && active.length === 0 && delivered.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--text-dimmed)", padding: "60px 0", fontSize: 15 }}>
              No orders to receive yet.
            </div>
          )}

          {active.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 12, textTransform: "uppercase" }}>
                Outstanding ({active.length})
              </div>
              {active.map(order => (
                <OrderCard key={order.id} order={order} onDeliver={setDeliveringOrder} />
              ))}
            </>
          )}

          {delivered.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, margin: "28px 0 12px", textTransform: "uppercase" }}>
                Delivered ({delivered.length})
              </div>
              {delivered.map(order => (
                <OrderCard key={order.id} order={order} onDeliver={setDeliveringOrder} />
              ))}
            </>
          )}
        </div>
      </div>

      {deliveringOrder && (
        <DeliverModal
          order={deliveringOrder}
          onConfirm={handleDeliver}
          onCancel={() => setDeliveringOrder(null)}
        />
      )}
    </>
  );
}
