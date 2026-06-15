import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { S } from '../styles';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = async () => {
    const res = await api.get("/api/notifications");
    if (res) {
      setNotifications(res.notifications);
      setUnread(res.unread);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    await api.post("/api/notifications/read", {});
    setUnread(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
  };

  const deleteNotification = async (id) => {
    await api.del(`/api/notifications/${id}`);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnread(prev => Math.max(0, prev - 1));
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => { setOpen(!open); if (!open && unread > 0) markAllRead(); }} style={{
        background: unread > 0 ? "var(--accent-bg)" : "var(--bg-tertiary)",
        border: unread > 0 ? "1px solid var(--accent-border)" : "1px solid var(--border-primary)",
        borderRadius: 7, padding: "7px 10px", fontSize: 13, cursor: "pointer",
        color: unread > 0 ? "var(--accent)" : "var(--text-muted)",
        position: "relative",
      }}>
        {"\ud83d\udd14"}
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: "var(--danger)", color: "#fff", fontSize: 9, fontWeight: 700,
            borderRadius: "50%", width: 16, height: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 8,
          width: 320, maxHeight: 400, overflowY: "auto",
          background: "var(--bg-modal)", border: "1px solid var(--border-primary)",
          borderRadius: 12, boxShadow: "var(--shadow-modal)", zIndex: 1000,
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid var(--border-primary)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ ...S.mono, fontSize: 12, fontWeight: 600 }}>Notifications</span>
            {notifications.length > 0 && (
              <button onClick={markAllRead} style={{
                ...S.mono, fontSize: 10, background: "transparent", border: "none",
                color: "var(--accent)", cursor: "pointer",
              }}>Mark all read</button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", ...S.mono, fontSize: 12, color: "var(--text-muted)" }}>
              No notifications
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{
                padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)",
                display: "flex", gap: 10, alignItems: "flex-start",
                background: n.is_read ? "transparent" : "var(--accent-bg)",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: n.is_read ? 400 : 600 }}>{n.title}</div>
                  {n.message && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{n.message}</div>}
                  <div style={{ ...S.mono, fontSize: 10, color: "var(--text-dimmed)", marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }} style={{
                  background: "transparent", border: "none", color: "var(--text-dimmed)",
                  cursor: "pointer", fontSize: 11, padding: 2, flexShrink: 0,
                }}>{"\u2715"}</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
