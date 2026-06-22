import { useState, useEffect } from 'react';
import { STAGES, DELIVERED_STATUSES, TO_RECIPIENTS, CC_RECIPIENTS, resolveRecipientEmails } from '../constants';
import { S } from '../styles';
import { getCurrentStage, daysSince, formatDate, formatCurrency, isValidUrl, buildMailtoLink, buildFollowupMailtoLink, copyRichText, rollupStatus } from '../utils';
import { api } from '../api';
import ProductImage from './ProductImage';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function timeAgo(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function describeAudit(entry) {
  const { action, changes } = entry;
  if (action === "create") return "created this order";
  if (action === "comment") return `commented: "${changes?.text || ""}"`;
  if (action === "archive") return "archived this order";
  if (action === "unarchive") return "unarchived this order";
  if (action === "delete") return "deleted this order";
  if (action === "update" && changes) {
    if (changes.bulk_move != null) {
      return `bulk moved to ${STAGES[changes.bulk_move]?.label || "Unknown"}`;
    }
    const parts = [];
    for (const [field, diff] of Object.entries(changes)) {
      if (field === "status") {
        parts.push(`status → ${diff.new || "requested"}`);
      } else {
        parts.push(`changed ${field}`);
      }
    }
    return parts.join(", ") || "updated";
  }
  return action;
}

// Renders comment text, turning a "[photo attached: /url]" marker into a clickable thumbnail.
const PHOTO_MARKER = /\[photo attached:\s*([^\]]+)\]/;
function CommentBody({ text, onViewPhoto }) {
  const m = text.match(PHOTO_MARKER);
  const cleanText = m ? text.replace(PHOTO_MARKER, "").trim() : text;
  const photoUrl = m ? m[1].trim() : null;
  return (
    <div>
      {cleanText && (
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0 }}>{cleanText}</p>
      )}
      {photoUrl && (
        <img src={photoUrl} alt="Delivery photo"
          onClick={() => onViewPhoto(photoUrl)}
          style={{ marginTop: cleanText ? 8 : 0, maxWidth: "100%", maxHeight: 160, borderRadius: 6, border: "1px solid var(--border-primary)", cursor: "pointer", objectFit: "cover" }} />
      )}
    </div>
  );
}

export default function OrderDetailModal({ order, settings, user, onAdvance, onRevert, onDelete, onEdit, onArchive, onUnarchive, onReorder, onRefresh, onClose, toast }) {
  const [attachments, setAttachments] = useState([]);
  const [activeTab, setActiveTab] = useState("details");
  const [activity, setActivity] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [activityLoading, setActivityLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  // For bulk orders the displayed status is rolled up live from the sub-items.
  const effectiveOrder = (order.is_bulk && items.length) ? { ...order, status: rollupStatus(items) } : order;
  const stage = getCurrentStage(effectiveOrder);
  const isDelivered = DELIVERED_STATUSES.has(effectiveOrder.status);

  useEffect(() => {
    api.get(`/api/orders/${order.id}/attachments`).then(a => a && setAttachments(a));
    if (order.is_bulk) api.get(`/api/orders/${order.id}/items`).then(d => d && setItems(d));
  }, [order.id, order.is_bulk]);

  useEffect(() => {
    if (activeTab === "activity") {
      setActivityLoading(true);
      api.get(`/api/orders/${order.id}/activity`).then(data => {
        if (data) setActivity(data);
        setActivityLoading(false);
      });
    }
  }, [activeTab, order.id]);

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    const res = await api.post(`/api/orders/${order.id}/comments`, { text: newComment });
    if (res) {
      setActivity(prev => [...prev, { type: "comment", id: `c-${res.id}`, commentId: res.id, username: res.username, userId: res.user_id, text: res.text, timestamp: res.created_at }]);
      setNewComment("");
    }
  };

  const handleDeleteComment = async (commentId) => {
    const res = await api.del(`/api/comments/${commentId}`);
    if (res?.success) {
      setActivity(prev => prev.filter(a => a.commentId !== commentId));
    }
  };

  // Open a pre-addressed follow-up email to this order's recipients (manual nudge).
  const handleFollowup = async () => {
    const toEmails = resolveRecipientEmails(order.recipients, TO_RECIPIENTS);
    const ccEmails = resolveRecipientEmails(order.cc_recipients, CC_RECIPIENTS);
    const email = buildFollowupMailtoLink(order, toEmails.join(";"), ccEmails);
    // Copy the clickable-link version for pasting, since mailto bodies stay plaintext in new Outlook.
    await copyRichText(email.html, email.text);
    const a = document.createElement("a");
    a.href = email.mailto;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast?.("Outlook draft opened — click in the body, then Ctrl+A and Ctrl+V to paste the version with clickable links.");
  };

  // Advance/revert a single sub-item; the server re-rolls the parent status, and onRefresh
  // updates the board behind the modal.
  const handleItemStage = async (item, dir) => {
    const idx = STAGES.findIndex(s => s.key === item.status);
    const next = (idx < 0 ? 0 : idx) + dir;
    if (next < 0 || next >= STAGES.length) return;
    const res = await api.put(`/api/orders/items/${item.id}`, { ...item, status: STAGES[next].key });
    if (res) {
      setItems(prev => prev.map(it => it.id === item.id ? res : it));
      onRefresh?.();
    }
  };

  const totalCost = order.unit_cost != null ? order.unit_cost * (order.quantity || 1) : null;

  return (
    <div style={S.modal} onClick={onClose}>
      <div className="modal-box" style={{ ...S.modalBox, maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        {/* Header with image */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <ProductImage url={order.link} imageUrl={order.image_url} name={order.name} orderId={order.id} size={100} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>
              {order.name}
            </h2>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {order.quantity > 1 && (
                <span style={{
                  ...S.mono, fontSize: 11, background: "var(--bg-hover)",
                  borderRadius: 4, padding: "2px 6px", color: "var(--text-secondary)",
                }}>Qty: {order.quantity}</span>
              )}
              {order.category && (
                <span style={{
                  ...S.mono, fontSize: 10, background: "var(--accent-bg)",
                  borderRadius: 4, padding: "2px 7px", color: "var(--accent)",
                }}>{order.category}</span>
              )}
              {order.department && (
                <span style={{
                  ...S.mono, fontSize: 10, background: "var(--bg-hover)",
                  borderRadius: 4, padding: "2px 7px", color: "var(--text-secondary)",
                }}>{order.department}</span>
              )}
              {order.archived === 1 && (
                <span style={{
                  ...S.mono, fontSize: 10, background: "var(--bg-hover)",
                  borderRadius: 4, padding: "2px 7px", color: "var(--text-muted)",
                }}>Archived</span>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid var(--border-primary)" }}>
          {["details", ...(order.is_bulk ? ["items"] : []), "activity"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              ...S.mono, fontSize: 11, fontWeight: activeTab === tab ? 700 : 400,
              padding: "8px 16px", background: "transparent", border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === tab ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5,
            }}>{tab}</button>
          ))}
        </div>

        {activeTab === "details" && (
          <>
            {/* Link */}
            {isValidUrl(order.link) && (
              <a href={order.link} target="_blank" rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
                  padding: "10px 14px", borderRadius: 8, background: "var(--bg-tertiary)",
                  border: "1px solid var(--border-primary)", color: "#60a5fa",
                  fontSize: 12, textDecoration: "none", overflow: "hidden",
                }}>
                <span style={{ fontSize: 16 }}>{"\uD83D\uDD17"}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {order.link}
                </span>
                <span style={{ flexShrink: 0 }}>{"\u2197"}</span>
              </a>
            )}

            {/* Details grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Date</label>
                <p style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>
                  {formatDate(order.date)} <span style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)" }}>({daysSince(order.date)}d ago)</span>
                </p>
              </div>
              <div>
                <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Created By</label>
                <p style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>{order.created_by || "\u2014"}</p>
              </div>
              <div>
                <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Requested By</label>
                <p style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>{order.requested_by || "\u2014"}</p>
              </div>
              <div>
                <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Department</label>
                <p style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>{order.department || "\u2014"}</p>
              </div>
              <div>
                <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Vendor</label>
                <p style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>{order.vendor || "\u2014"}</p>
              </div>
              {order.unit_cost != null && (
                <>
                  <div>
                    <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Unit Cost</label>
                    <p style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>{formatCurrency(order.unit_cost)}</p>
                  </div>
                  <div>
                    <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Total Cost</label>
                    <p style={{ fontSize: 15, color: "var(--accent)", marginTop: 2, fontWeight: 700 }}>{formatCurrency(totalCost)}</p>
                  </div>
                </>
              )}
            </div>

            {/* Notes */}
            {order.notes && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Notes</label>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{order.notes}</p>
              </div>
            )}

            {/* Stage progress */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, display: "block" }}>Progress</label>
              <div style={{ display: "flex", gap: 4 }}>
                {STAGES.map((s, i) => (
                  <div key={s.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{
                      width: "100%", height: 6, borderRadius: 3,
                      background: i <= stage ? s.color : "var(--border-primary)",
                      transition: "background 0.3s",
                    }} />
                    <span style={{
                      ...S.mono, fontSize: 7, color: i <= stage ? s.color : "var(--text-dimmed)",
                      fontWeight: i === stage ? 700 : 400, textAlign: "center", lineHeight: 1.2,
                    }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" }}>
                  Attachments ({attachments.length})
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {attachments.map(a => (
                    <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "center", gap: 8, fontSize: 11,
                        padding: "4px 8px", background: "var(--bg-tertiary)", borderRadius: 6,
                        color: "var(--accent)", textDecoration: "none",
                      }}>
                      <span style={{ color: "var(--text-muted)" }}>{"\uD83D\uDCCE"}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.filename}</span>
                      <span style={{ ...S.mono, fontSize: 9, color: "var(--text-dimmed)" }}>{formatSize(a.size)}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "items" && (
          <div style={{ minHeight: 100 }}>
            {items.length === 0 ? (
              <p style={{ ...S.mono, fontSize: 12, color: "var(--text-dimmed)", textAlign: "center", padding: 20 }}>No sub-items yet.</p>
            ) : (
              <>
                <p style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", marginBottom: 10 }}>
                  Update each item's status below — the order's overall status updates automatically.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map(item => {
                    const i = STAGES.findIndex(s => s.key === item.status);
                    const itemStage = i >= 0 ? i : 0;
                    const itemStageInfo = STAGES[itemStage];
                    return (
                      <div key={item.id} style={{ padding: "10px 12px", borderRadius: 8, background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{item.name}</span>
                            {isValidUrl(item.link) && (
                              <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#60a5fa", marginLeft: 8 }}>↗</a>
                            )}
                            <div style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                              Qty: {item.quantity || 1}
                              {item.unit_cost != null && <span> · {formatCurrency(item.unit_cost * (item.quantity || 1))}</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                            <button onClick={() => handleItemStage(item, -1)} disabled={itemStage <= 0} title="Move back"
                              style={{ background: "transparent", border: "none", color: "var(--text-dimmed)", cursor: itemStage > 0 ? "pointer" : "default", fontSize: 15, padding: "0 2px", lineHeight: 1, opacity: itemStage > 0 ? 1 : 0.3 }}>‹</button>
                            <span style={{
                              ...S.mono, fontSize: 10, borderRadius: 999, padding: "2px 8px",
                              background: itemStageInfo.color + "22", color: itemStageInfo.color,
                              border: `1px solid ${itemStageInfo.color}44`, whiteSpace: "nowrap", minWidth: 92, textAlign: "center",
                            }}>{itemStageInfo.label}</span>
                            <button onClick={() => handleItemStage(item, 1)} disabled={itemStage >= STAGES.length - 1} title="Move forward"
                              style={{ background: "transparent", border: "none", color: "var(--text-dimmed)", cursor: itemStage < STAGES.length - 1 ? "pointer" : "default", fontSize: 15, padding: "0 2px", lineHeight: 1, opacity: itemStage < STAGES.length - 1 ? 1 : 0.3 }}>›</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div style={{ minHeight: 120 }}>
            {/* Comment input */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePostComment(); } }}
                style={{ ...S.input, flex: 1, minHeight: 36, resize: "none", fontSize: 12 }} />
              <button onClick={handlePostComment} disabled={!newComment.trim()}
                style={{ ...S.btnPrimary, padding: "8px 14px", fontSize: 11, opacity: newComment.trim() ? 1 : 0.5 }}>Post</button>
            </div>

            {/* Timeline */}
            {activityLoading ? (
              <p style={{ ...S.mono, fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: 20 }}>Loading...</p>
            ) : activity.length === 0 ? (
              <p style={{ ...S.mono, fontSize: 12, color: "var(--text-dimmed)", textAlign: "center", padding: 20 }}>No activity yet</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
                {activity.map(item => (
                  <div key={item.id} style={{
                    padding: "8px 10px", borderRadius: 6, fontSize: 12,
                    background: item.type === "comment" ? "var(--bg-tertiary)" : "transparent",
                    borderLeft: item.type === "comment" ? "3px solid var(--accent)" : "3px solid var(--border-primary)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 11 }}>{item.username}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ ...S.mono, fontSize: 9, color: "var(--text-dimmed)" }}>{timeAgo(item.timestamp)}</span>
                        {item.type === "comment" && user && (item.userId === user.id || user.role === "admin") && (
                          <button onClick={() => handleDeleteComment(item.commentId)}
                            style={{ background: "transparent", border: "none", color: "var(--text-dimmed)", cursor: "pointer", fontSize: 10, padding: 0 }}
                            title="Delete comment">{"\u2715"}</button>
                        )}
                      </div>
                    </div>
                    {item.type === "comment" ? (
                      <CommentBody text={item.text} onViewPhoto={setLightbox} />
                    ) : (
                      <p style={{ color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>{describeAudit(item)}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderTop: "1px solid var(--border-primary)", paddingTop: 16, marginTop: 8 }}>
          {/* For bulk orders the status is driven by the sub-items (Items tab), so hide parent advance/revert */}
          {!order.is_bulk && stage < STAGES.length - 1 && stage >= 0 && (
            <button onClick={() => { onAdvance(order.id); onClose(); }} style={{
              ...S.mono, background: STAGES[stage + 1].color, color: "#fff", border: "none",
              borderRadius: 6, padding: "7px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>{"\u2192"} {STAGES[stage + 1].label}</button>
          )}
          {!order.is_bulk && stage > 0 && (
            <button onClick={() => { onRevert(order.id); onClose(); }} style={{
              ...S.mono, background: "var(--bg-input)", color: "var(--text-muted)",
              border: "1px solid var(--border-input)", borderRadius: 6,
              padding: "7px 14px", fontSize: 11, cursor: "pointer",
            }}>{"\u2190"} Back</button>
          )}
          <button onClick={() => { onEdit(order); onClose(); }} style={{
            ...S.mono, background: "var(--bg-tertiary)", color: "var(--text-secondary)",
            border: "1px solid var(--border-primary)", borderRadius: 6,
            padding: "7px 14px", fontSize: 11, cursor: "pointer",
          }}>{"\u270E"} Edit</button>
          {onReorder && (
            <button onClick={() => { onReorder(order); onClose(); }} style={{
              ...S.mono, background: "var(--bg-tertiary)", color: "var(--text-secondary)",
              border: "1px solid var(--border-primary)", borderRadius: 6,
              padding: "7px 14px", fontSize: 11, cursor: "pointer",
            }}>{"\u21BB"} Reorder</button>
          )}
          {!isDelivered && (
            <button onClick={handleFollowup} title="Open a follow-up email to the recipients" style={{
              ...S.mono, background: "var(--bg-tertiary)", color: "var(--text-secondary)",
              border: "1px solid var(--border-primary)", borderRadius: 6,
              padding: "7px 14px", fontSize: 11, cursor: "pointer",
            }}>{"\u2709"} Follow up</button>
          )}
          <button onClick={() => window.print()} style={{
            ...S.mono, background: "var(--bg-tertiary)", color: "var(--text-secondary)",
            border: "1px solid var(--border-primary)", borderRadius: 6,
            padding: "7px 14px", fontSize: 11, cursor: "pointer",
          }}>{"\uD83D\uDDA8"} Print</button>
          {isDelivered && !order.archived && onArchive && (
            <button onClick={() => { onArchive(order.id); onClose(); }} style={{
              ...S.mono, background: "var(--bg-tertiary)", color: "var(--text-muted)",
              border: "1px solid var(--border-primary)", borderRadius: 6,
              padding: "7px 14px", fontSize: 11, cursor: "pointer",
            }}>{"\uD83D\uDCE6"} Archive</button>
          )}
          {order.archived === 1 && onUnarchive && (
            <button onClick={() => { onUnarchive(order.id); onClose(); }} style={{
              ...S.mono, background: "var(--bg-tertiary)", color: "var(--accent)",
              border: "1px solid var(--accent)", borderRadius: 6,
              padding: "7px 14px", fontSize: 11, cursor: "pointer",
            }}>{"\u21A9"} Unarchive</button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => { if (confirm("Delete this order?")) { onDelete(order.id); onClose(); } }} style={{
            ...S.mono, background: "transparent", color: "var(--danger)",
            border: "1px solid var(--danger-border)", borderRadius: 6,
            padding: "7px 12px", fontSize: 11, cursor: "pointer",
          }}>{"\u2715"} Delete</button>
          <button onClick={onClose} style={S.btnGhost}>Close</button>
        </div>
      </div>

      {lightbox && (
        <div onClick={e => { e.stopPropagation(); setLightbox(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
          <img src={lightbox} alt="Delivery photo" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
          <a href={lightbox} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            style={{ ...S.mono, position: "absolute", bottom: 20, background: "rgba(255,255,255,0.1)", color: "#fff", padding: "8px 16px", borderRadius: 6, fontSize: 12, textDecoration: "none" }}>
            Open full size ↗
          </a>
          <button onClick={() => setLightbox(null)}
            style={{ position: "absolute", top: 20, right: 24, background: "transparent", border: "none", color: "#fff", fontSize: 28, cursor: "pointer", lineHeight: 1 }}>{"✕"}</button>
        </div>
      )}
    </div>
  );
}
