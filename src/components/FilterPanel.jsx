import { STAGES } from '../constants';
import { S } from '../styles';

export default function FilterPanel({ dateFrom, dateTo, setDateFrom, setDateTo, filterStages, setFilterStages, filterCreatedBy, setFilterCreatedBy, users, filterDepartment, setFilterDepartment, departments }) {
  const toggleStage = (idx) => {
    setFilterStages(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div style={{
      padding: "10px 20px", borderBottom: "1px solid var(--border-primary)",
      background: "var(--bg-secondary)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Date</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ ...S.mono, fontSize: 11, padding: "4px 6px", borderRadius: 5, border: "1px solid var(--border-primary)", background: "var(--bg-input)", color: "var(--text-primary)", colorScheme: "dark" }} />
        <span style={{ ...S.mono, fontSize: 10, color: "var(--text-dimmed)" }}>to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ ...S.mono, fontSize: 11, padding: "4px 6px", borderRadius: 5, border: "1px solid var(--border-primary)", background: "var(--bg-input)", color: "var(--text-primary)", colorScheme: "dark" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Stage</label>
        {STAGES.map((s, i) => (
          <button key={s.key} onClick={() => toggleStage(i)} style={{
            ...S.mono, fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
            background: filterStages.has(i) ? s.color : "var(--bg-input)",
            color: filterStages.has(i) ? "#fff" : "var(--text-muted)",
            border: "1px solid var(--border-primary)",
          }}>{s.label}</button>
        ))}
      </div>

      {users?.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>By</label>
          <select value={filterCreatedBy} onChange={e => setFilterCreatedBy(e.target.value)}
            style={{ ...S.mono, fontSize: 11, padding: "4px 6px", borderRadius: 5, border: "1px solid var(--border-primary)", background: "var(--bg-input)", color: "var(--text-primary)" }}>
            <option value="">All Users</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      )}

      {departments?.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Dept</label>
          <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}
            style={{ ...S.mono, fontSize: 11, padding: "4px 6px", borderRadius: 5, border: "1px solid var(--border-primary)", background: "var(--bg-input)", color: "var(--text-primary)" }}>
            <option value="">All Depts</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}

      <button onClick={() => { setDateFrom(""); setDateTo(""); setFilterStages(new Set()); setFilterCreatedBy(""); setFilterDepartment?.(""); }}
        style={{ ...S.mono, fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer", background: "transparent", border: "1px solid var(--border-primary)", color: "var(--text-muted)" }}>
        Clear Filters
      </button>
    </div>
  );
}
