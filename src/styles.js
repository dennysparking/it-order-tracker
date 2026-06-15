export const S = {
  input: {
    width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-input)",
    borderRadius: 8, padding: "10px 14px", color: "var(--text-primary)", fontSize: 14,
  },
  label: {
    display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)",
    marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
  },
  btnPrimary: {
    background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
  },
  btnGhost: {
    background: "var(--bg-hover)", color: "var(--text-secondary)",
    border: "1px solid var(--border-primary)", borderRadius: 8,
    padding: "10px 20px", fontSize: 14, cursor: "pointer",
  },
  mono: { fontFamily: "'JetBrains Mono', monospace" },
  modal: {
    position: "fixed", inset: 0, background: "var(--backdrop)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, backdropFilter: "blur(4px)",
  },
  modalBox: {
    background: "var(--bg-modal)", border: "1px solid var(--border-primary)",
    borderRadius: 16, padding: 32, width: "100%", maxWidth: 480,
    boxShadow: "var(--shadow-modal)", maxHeight: "90vh", overflowY: "auto",
  },
};
