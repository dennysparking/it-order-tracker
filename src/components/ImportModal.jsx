import { useState, useRef } from 'react';
import { S } from '../styles';

export default function ImportModal({ onImport, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef(null);

  const orderFields = [
    { key: "name", label: "Item Name *", required: true },
    { key: "link", label: "Link / URL" },
    { key: "quantity", label: "Quantity" },
    { key: "unit_cost", label: "Unit Cost" },
    { key: "notes", label: "Notes" },
    { key: "date", label: "Date" },
    { key: "email_sent", label: "Email Sent" },
    { key: "email_replied", label: "Email Replied" },
    { key: "followup", label: "Follow-up" },
    { key: "delivered", label: "Delivered" },
  ];

  const handleFile = async (f) => {
    setFile(f);
    setResult(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("file", f);

    const res = await fetch("/api/orders/import?preview=true", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setLoading(false);

    if (data.error) {
      setPreview(null);
      setResult({ error: data.error });
      return;
    }

    setPreview(data);
    // Auto-map columns by matching names (with priority & exclusion)
    const autoMap = {};
    const claimed = new Set();

    const matchRules = [
      { key: "name", match: c => c.includes("name") || c.includes("item") || c.includes("order") },
      { key: "link", match: c => (c.includes("url") || c.includes("link")) && !c.includes("order") },
      { key: "quantity", match: c => c.includes("quantity") || c.includes("qty") },
      { key: "notes", match: c => c.includes("note") },
      { key: "date", match: c => c.includes("date") },
      { key: "email_sent", match: c => c.includes("email") && c.includes("sent") },
      { key: "email_replied", match: c => c.includes("replied") || (c.includes("email") && c.includes("repl")) },
      { key: "unit_cost", match: c => c.includes("cost") || c.includes("price") },
      { key: "followup", match: c => c.includes("follow") },
      { key: "delivered", match: c => c.includes("deliver") },
    ];

    for (const rule of matchRules) {
      const col = data.columns.find(c => !claimed.has(c) && rule.match(c.toLowerCase()));
      if (col) {
        autoMap[rule.key] = col;
        claimed.add(col);
      }
    }
    setMapping(autoMap);
  };

  const handleImport = async () => {
    if (!file || !mapping.name) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping", JSON.stringify(mapping));

    const res = await fetch("/api/orders/import", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setLoading(false);
    setResult(data);

    if (data.imported > 0) {
      onImport();
    }
  };

  const isCSV = file?.name?.toLowerCase().endsWith('.csv');

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={{ ...S.modalBox, maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ ...S.mono, fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Import Orders</h2>

        {/* File Upload */}
        <div
          onClick={() => fileInput.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
          style={{
            border: "2px dashed var(--border-input)", borderRadius: 12, padding: 32,
            textAlign: "center", cursor: "pointer", marginBottom: 20,
            background: "var(--bg-secondary)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>{"\uD83D\uDCC1"}</div>
          <p style={{ ...S.mono, fontSize: 13, color: "var(--text-secondary)" }}>
            {file ? file.name : "Drop .xlsx or .csv file here, or click to browse"}
          </p>
          <input ref={fileInput} type="file" accept=".xlsx,.csv,.xls" style={{ display: "none" }}
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        </div>

        {loading && <p style={{ ...S.mono, fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Processing...</p>}

        {/* Hyperlink / CSV tip */}
        {preview && !result?.imported && (
          <>
            {preview.hasHyperlinks && preview.hyperlinkColumns?.length > 0 && (
              <div style={{
                borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12,
                background: "var(--accent-bg)", border: "1px solid var(--accent)",
                color: "var(--accent)",
              }}>
                {"\uD83D\uDD17"} Hyperlinks detected in: <strong>{preview.hyperlinkColumns.join(", ")}</strong> — URLs will auto-import as item links.
              </div>
            )}
            {isCSV && (
              <div style={{
                borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 11,
                background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)",
                color: "var(--text-muted)",
              }}>
                {"\uD83D\uDCA1"} Tip: Export as <strong>.xlsx</strong> instead of .csv to preserve product hyperlinks.
              </div>
            )}
          </>
        )}

        {/* Column Mapping */}
        {preview && !result?.imported && (
          <>
            <p style={{ ...S.mono, fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
              {preview.totalRows} rows found. Map columns to fields:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {orderFields.map(f => (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ ...S.mono, fontSize: 11, color: "var(--text-muted)", width: 110, flexShrink: 0 }}>{f.label}</label>
                  <select
                    style={{ ...S.input, flex: 1 }}
                    value={mapping[f.key] || ""}
                    onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value || undefined }))}
                  >
                    <option value="">-- Skip --</option>
                    {preview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview Table */}
            <div style={{ overflowX: "auto", marginBottom: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    {preview.columns.map(c => (
                      <th key={c} style={{ ...S.mono, padding: "4px 8px", textAlign: "left", color: "var(--text-muted)", borderBottom: "1px solid var(--border-primary)", fontSize: 10 }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i}>
                      {preview.columns.map(c => (
                        <td key={c} style={{ padding: "4px 8px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {String(row[c] || "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Result */}
        {result && (
          <div style={{
            borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13,
            background: result.error ? "var(--danger-bg)" : "var(--success-bg)",
            border: result.error ? "1px solid var(--danger-border)" : "1px solid var(--success-border)",
            color: result.error ? "var(--danger)" : "var(--success)",
          }}>
            {result.error ? result.error : `Imported ${result.imported} of ${result.total} orders.`}
            {result.duplicates?.length > 0 && (
              <p style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>
                {result.duplicates.length} duplicate{result.duplicates.length > 1 ? "s" : ""} skipped: {result.duplicates.slice(0, 5).map(d => d.name).join(", ")}{result.duplicates.length > 5 ? "..." : ""}
              </p>
            )}
            {result.errors?.length > 0 && (
              <p style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>
                {result.errors.length} rows skipped (missing name or errors).
              </p>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={S.btnGhost}>{result?.imported ? "Done" : "Cancel"}</button>
          {preview && !result?.imported && (
            <button
              onClick={handleImport}
              disabled={!mapping.name || loading}
              style={{ ...S.btnPrimary, opacity: !mapping.name || loading ? 0.5 : 1 }}
            >
              Import {preview.totalRows} Orders
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
