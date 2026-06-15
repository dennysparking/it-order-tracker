const colors = {
  success: { bg: "#22c55e", border: "#16a34a" },
  error: { bg: "#ef4444", border: "#dc2626" },
  info: { bg: "#3b82f6", border: "#2563eb" },
};

export default function Toast({ toasts, onRemove }) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 10000,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      {toasts.map(t => {
        const c = colors[t.type] || colors.info;
        return (
          <div key={t.id} onClick={() => onRemove(t.id)} style={{
            padding: "10px 16px", borderRadius: 8, color: "#fff",
            background: c.bg, border: `1px solid ${c.border}`,
            fontSize: 13, fontWeight: 500, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            animation: "slideIn 0.2s ease-out",
            maxWidth: 360,
          }}>
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
