import { useState, useEffect } from 'react';
import { api } from '../api';
import { S } from '../styles';

export default function AuditLogPage({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const loadLog = async (p, entityType) => {
    setLoading(true);
    const params = new URLSearchParams({ page: p, limit: 50 });
    if (entityType) params.set("entity_type", entityType);
    const res = await api.get(`/api/audit-log?${params}`);
    if (res) {
      setEntries(res.entries);
      setTotal(res.total);
    }
    setLoading(false);
  };

  useEffect(() => { loadLog(page, filter); }, [page, filter]);

  const formatChanges = (changes) => {
    if (!changes) return "";
    return Object.entries(changes).map(([key, val]) => {
      if (val && typeof val === "object" && "old" in val) {
        return `${key}: ${val.old} → ${val.new}`;
      }
      return `${key}: ${JSON.stringify(val)}`;
    }).join(", ");
  };

  const actionColors = {
    create: "#22c55e",
    update: "#3b82f6",
    delete: "#ef4444",
    import: "#a855f7",
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          ...S.mono, background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)",
          borderRadius: 7, padding: "7px 12px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer",
        }}>{"\u2190"} Back</button>
        <h2 style={{ ...S.mono, fontSize: 18, fontWeight: 700 }}>Audit Log</h2>
        <span style={{ ...S.mono, fontSize: 11, color: "var(--text-muted)" }}>{total} entries</span>

        <select style={{ ...S.input, width: 140, marginLeft: "auto" }} value={filter}
          onChange={e => { setFilter(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          <option value="order">Orders</option>
          <option value="settings">Settings</option>
          <option value="user">Users</option>
        </select>
      </div>

      {loading ? (
        <p style={{ ...S.mono, color: "var(--text-muted)", fontSize: 13 }}>Loading...</p>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-primary)" }}>
                {["Time", "User", "Action", "Type", "Entity", "Changes"].map(h => (
                  <th key={h} style={{
                    ...S.mono, textAlign: "left", padding: "8px 10px", fontSize: 10,
                    fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8,
                    color: "var(--text-muted)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ ...S.mono, padding: "8px 10px", fontSize: 11, color: "var(--text-muted)" }}>
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{e.username}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{
                      ...S.mono, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                      background: (actionColors[e.action] || "#666") + "18",
                      color: actionColors[e.action] || "#666",
                    }}>{e.action.toUpperCase()}</span>
                  </td>
                  <td style={{ ...S.mono, padding: "8px 10px", fontSize: 11, color: "var(--text-muted)" }}>{e.entity_type}</td>
                  <td style={{ ...S.mono, padding: "8px 10px", fontSize: 11, color: "var(--text-muted)" }}>{e.entity_id || "—"}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-muted)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {formatChanges(e.changes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {entries.length === 0 && (
            <p style={{ textAlign: "center", padding: 40, ...S.mono, color: "var(--text-dimmed)", fontSize: 13 }}>No audit log entries.</p>
          )}

          {/* Pagination */}
          {total > 50 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                style={{ ...S.btnGhost, padding: "6px 12px", fontSize: 12, opacity: page <= 1 ? 0.3 : 1 }}>{"\u2190"} Prev</button>
              <span style={{ ...S.mono, fontSize: 12, color: "var(--text-muted)", padding: "6px 12px" }}>
                Page {page} of {Math.ceil(total / 50)}
              </span>
              <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(page + 1)}
                style={{ ...S.btnGhost, padding: "6px 12px", fontSize: 12, opacity: page >= Math.ceil(total / 50) ? 0.3 : 1 }}>Next {"\u2192"}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
