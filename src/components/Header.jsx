import { useState, useRef, useEffect } from 'react';
import { STAGES } from '../constants';
import { S } from '../styles';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './NotificationBell';

const ghostBtn = {
  background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)",
  borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer",
};

export default function Header({
  totalActive, totalStale, totalDelivered,
  search, setSearch, filterStale, setFilterStale,
  categoryFilter, setCategoryFilter, categories,
  view, setView, onSettings, onNewOrder, onImport, onExport, onAuditLog, onDashboard, onLogout,
  isAdmin,
  selectionMode, setSelectionMode, selectedCount, onDeleteSelected, onSelectAll, onBulkMove,
  onBulkSetCategory, onBulkSetDepartment, onBulkArchive,
  departments,
  showFilters, setShowFilters,
  showArchived, setShowArchived, onLoadOrders,
  searchRef,
}) {
  const { theme, toggleTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  return (
    <header className="header-bar" style={{
      borderBottom: "1px solid var(--border-primary)", padding: "12px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 10, background: "var(--bg-secondary)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: "linear-gradient(135deg, #3b82f6, #6366f1)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
        }}>{"\u26a1"}</div>
        <div>
          <h1 style={{ ...S.mono, fontSize: 16, fontWeight: 700, letterSpacing: -0.5 }}>IT Orders</h1>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {totalActive} active
            {totalStale > 0 && <span style={{ color: "var(--danger)" }}> {"\u00b7"} {totalStale} stale</span>}
            {" \u00b7 "}{totalDelivered} delivered
          </p>
        </div>
      </div>

      <div className="header-controls" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {/* Selection mode toolbar */}
        {selectionMode ? (
          <>
            <span style={{ ...S.mono, fontSize: 12, color: "var(--text-secondary)", padding: "0 8px" }}>
              {selectedCount} selected
            </span>
            <button onClick={onSelectAll} style={{
              ...ghostBtn, ...S.mono, fontSize: 11,
            }}>Select All</button>
            {/* Bulk move dropdown */}
            <select onChange={e => { if (e.target.value !== "") { onBulkMove(parseInt(e.target.value)); e.target.value = ""; } }}
              disabled={selectedCount === 0}
              style={{
                ...ghostBtn, ...S.mono, fontSize: 11, padding: "7px 8px",
                opacity: selectedCount > 0 ? 1 : 0.5, cursor: selectedCount > 0 ? "pointer" : "not-allowed",
              }}>
              <option value="">Move to...</option>
              {STAGES.map((s, i) => <option key={s.key} value={i}>{s.label}</option>)}
            </select>
            {/* Bulk set category dropdown */}
            {categories?.length > 0 && (
              <select onChange={e => { if (e.target.value !== "") { onBulkSetCategory(e.target.value === "__none__" ? "" : e.target.value); e.target.value = ""; } }}
                disabled={selectedCount === 0}
                style={{
                  ...ghostBtn, ...S.mono, fontSize: 11, padding: "7px 8px",
                  opacity: selectedCount > 0 ? 1 : 0.5, cursor: selectedCount > 0 ? "pointer" : "not-allowed",
                }}>
                <option value="">Set category...</option>
                <option value="__none__">None</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {/* Bulk set department dropdown */}
            {departments?.length > 0 && (
              <select onChange={e => { if (e.target.value !== "") { onBulkSetDepartment(e.target.value === "__none__" ? "" : e.target.value); e.target.value = ""; } }}
                disabled={selectedCount === 0}
                style={{
                  ...ghostBtn, ...S.mono, fontSize: 11, padding: "7px 8px",
                  opacity: selectedCount > 0 ? 1 : 0.5, cursor: selectedCount > 0 ? "pointer" : "not-allowed",
                }}>
                <option value="">Set dept...</option>
                <option value="__none__">None</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            {/* Bulk archive */}
            <button onClick={onBulkArchive} disabled={selectedCount === 0} style={{
              ...S.mono, fontSize: 11, cursor: selectedCount > 0 ? "pointer" : "not-allowed",
              borderRadius: 7, padding: "7px 12px", fontWeight: 600,
              background: selectedCount > 0 ? "var(--bg-tertiary)" : "var(--bg-tertiary)",
              color: selectedCount > 0 ? "var(--text-secondary)" : "var(--text-dimmed)",
              border: "1px solid var(--border-primary)",
              opacity: selectedCount > 0 ? 1 : 0.5,
            }}>{"\uD83D\uDCE6"} Archive</button>
            <button onClick={onDeleteSelected} disabled={selectedCount === 0} style={{
              ...S.mono, fontSize: 11, cursor: selectedCount > 0 ? "pointer" : "not-allowed",
              borderRadius: 7, padding: "7px 12px", fontWeight: 600,
              background: selectedCount > 0 ? "var(--danger)" : "var(--bg-tertiary)",
              color: selectedCount > 0 ? "#fff" : "var(--text-dimmed)",
              border: selectedCount > 0 ? "1px solid var(--danger)" : "1px solid var(--border-primary)",
              opacity: selectedCount > 0 ? 1 : 0.5,
            }}>{"\u2715"} Delete</button>
            <button onClick={() => setSelectionMode(false)} style={ghostBtn}>Cancel</button>
          </>
        ) : (
          <>
            <input ref={searchRef} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              style={{
                background: "var(--bg-input)", border: "1px solid var(--border-primary)",
                borderRadius: 7, padding: "7px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none", width: 160,
              }} />
            {categories?.length > 0 && (
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                style={{ ...ghostBtn, ...S.mono, fontSize: 11, padding: "7px 8px" }}>
                <option value="">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <button onClick={() => setFilterStale(!filterStale)} style={{
              ...S.mono, fontSize: 11, cursor: "pointer", borderRadius: 7, padding: "7px 10px",
              background: filterStale ? "var(--danger-bg)" : "var(--bg-tertiary)",
              border: filterStale ? "1px solid var(--danger-border)" : "1px solid var(--border-primary)",
              color: filterStale ? "var(--danger)" : "var(--text-muted)",
            }}>{"\uD83D\uDD14"} Stale</button>
            <button onClick={() => setShowFilters(!showFilters)} style={{
              ...S.mono, fontSize: 11, cursor: "pointer", borderRadius: 7, padding: "7px 10px",
              background: showFilters ? "var(--accent-bg)" : "var(--bg-tertiary)",
              border: showFilters ? "1px solid var(--accent)" : "1px solid var(--border-primary)",
              color: showFilters ? "var(--accent)" : "var(--text-muted)",
            }}>{"\u2731"} Filters</button>
            <button onClick={() => { const next = !showArchived; setShowArchived(next); onLoadOrders(next); }} style={{
              ...S.mono, fontSize: 11, cursor: "pointer", borderRadius: 7, padding: "7px 10px",
              background: showArchived ? "var(--accent-bg)" : "var(--bg-tertiary)",
              border: showArchived ? "1px solid var(--accent)" : "1px solid var(--border-primary)",
              color: showArchived ? "var(--accent)" : "var(--text-muted)",
            }}>{"\uD83D\uDCE6"} {showArchived ? "Hide" : "Show"} Archived</button>
            <button onClick={() => setView(view === "pipeline" ? "list" : "pipeline")} style={ghostBtn}>
              {view === "pipeline" ? "\u2630 List" : "\u25eb Pipeline"}
            </button>
            <button onClick={() => setSelectionMode(true)} style={ghostBtn} title="Select orders for bulk actions">
              {"\u2610"} Select
            </button>
            <button onClick={onNewOrder} style={{
              ...S.mono, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 7,
              padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>+ New Order</button>

            {/* More dropdown */}
            <div ref={moreRef} style={{ position: "relative" }}>
              <button onClick={() => setMoreOpen(!moreOpen)} style={{ ...ghostBtn, fontSize: 16, padding: "4px 10px", lineHeight: 1 }}
                title="More actions">{"\u22EE"}</button>
              {moreOpen && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: 4,
                  background: "var(--bg-secondary)", border: "1px solid var(--border-primary)",
                  borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 100,
                  minWidth: 160, padding: "4px 0",
                }}>
                  <button onClick={() => { onDashboard(); setMoreOpen(false); }} style={{
                    display: "block", width: "100%", textAlign: "left", background: "transparent",
                    border: "none", padding: "8px 14px", fontSize: 12, color: "var(--text-secondary)",
                    cursor: "pointer", ...S.mono,
                  }} onMouseEnter={e => e.target.style.background = "var(--bg-hover)"}
                    onMouseLeave={e => e.target.style.background = "transparent"}>
                    {"\uD83D\uDCCA"} Dashboard
                  </button>
                  <button onClick={() => { onExport(); setMoreOpen(false); }} style={{
                    display: "block", width: "100%", textAlign: "left", background: "transparent",
                    border: "none", padding: "8px 14px", fontSize: 12, color: "var(--text-secondary)",
                    cursor: "pointer", ...S.mono,
                  }} onMouseEnter={e => e.target.style.background = "var(--bg-hover)"}
                    onMouseLeave={e => e.target.style.background = "transparent"}>
                    {"\u2B07"} Export CSV
                  </button>
                  <button onClick={() => { onImport(); setMoreOpen(false); }} style={{
                    display: "block", width: "100%", textAlign: "left", background: "transparent",
                    border: "none", padding: "8px 14px", fontSize: 12, color: "var(--text-secondary)",
                    cursor: "pointer", ...S.mono,
                  }} onMouseEnter={e => e.target.style.background = "var(--bg-hover)"}
                    onMouseLeave={e => e.target.style.background = "transparent"}>
                    {"\u2B06"} Import
                  </button>
                  {isAdmin && (
                    <button onClick={() => { onAuditLog(); setMoreOpen(false); }} style={{
                      display: "block", width: "100%", textAlign: "left", background: "transparent",
                      border: "none", padding: "8px 14px", fontSize: 12, color: "var(--text-secondary)",
                      cursor: "pointer", ...S.mono,
                    }} onMouseEnter={e => e.target.style.background = "var(--bg-hover)"}
                      onMouseLeave={e => e.target.style.background = "transparent"}>
                      {"\uD83D\uDCCB"} Audit Log
                    </button>
                  )}
                </div>
              )}
            </div>

            <NotificationBell />
            <button onClick={onSettings} style={{ ...ghostBtn, fontSize: 13 }}>{"\u2699"}</button>
            <button onClick={toggleTheme} style={ghostBtn} title="Toggle theme">
              {theme === "dark" ? "\u2600" : "\u263D"}
            </button>
            <button onClick={onLogout} style={{
              background: "transparent", border: "1px solid var(--border-primary)",
              borderRadius: 7, padding: "7px 10px", fontSize: 11, color: "var(--text-muted)", cursor: "pointer",
            }}>Logout</button>
          </>
        )}
      </div>
    </header>
  );
}
