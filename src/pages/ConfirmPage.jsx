import { useEffect, useState } from 'react';

export default function ConfirmPage({ token }) {
  const [state, setState] = useState("loading"); // loading | confirmed | already | error
  const [order, setOrder] = useState(null);

  useEffect(() => {
    fetch(`/api/confirm/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setState("error"); return; }
        setOrder(data);
        setState(data.alreadyConfirmed ? "already" : "confirmed");
      })
      .catch(() => setState("error"));
  }, [token]);

  const styles = {
    page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", color: "var(--text-primary)", fontFamily: "'Inter', system-ui, sans-serif" },
    card: { background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: 16, padding: 40, maxWidth: 480, width: "100%", margin: 20, textAlign: "center", boxShadow: "var(--shadow-modal)" },
    icon: { fontSize: 56, marginBottom: 16 },
    title: { fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 },
    sub: { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24 },
    name: { fontSize: 18, fontWeight: 600, color: "var(--accent)", marginBottom: 8 },
    badge: { display: "inline-block", background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 999, padding: "4px 14px", fontSize: 12, fontWeight: 600 },
  };

  if (state === "loading") return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.sub}>Loading...</div>
      </div>
    </div>
  );

  if (state === "error") return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>❌</div>
        <div style={styles.title}>Invalid Link</div>
        <div style={styles.sub}>This confirmation link is invalid or has expired.</div>
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>{state === "already" ? "✅" : "🎉"}</div>
        <div style={styles.name}>{order?.name}</div>
        <div style={styles.title}>{state === "already" ? "Already Confirmed" : "Order Confirmed!"}</div>
        <div style={styles.sub}>
          {state === "already"
            ? "This order was already confirmed. No action needed."
            : "Thank you! The IT team has been notified that this item has been ordered."}
        </div>
        {order?.quantity > 1 && <div style={{ ...styles.sub, marginBottom: 8 }}>Qty: {order.quantity}</div>}
        <span style={styles.badge}>✓ Confirmed</span>
      </div>
    </div>
  );
}
