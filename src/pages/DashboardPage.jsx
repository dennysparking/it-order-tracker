import { useState, useEffect } from 'react';
import { api } from '../api';
import { S } from '../styles';
import { formatCurrency, daysSince } from '../utils';

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-primary)",
      borderRadius: 12, padding: "20px 24px", flex: 1, minWidth: 140,
    }}>
      <div style={{ ...S.mono, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text-muted)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "var(--text-primary)" }}>{value ?? "\u2014"}</div>
    </div>
  );
}

function BarChart({ data, labelKey, valueKey, color = "var(--accent)", formatValue }) {
  if (!data || data.length === 0) return <p style={{ ...S.mono, fontSize: 12, color: "var(--text-muted)" }}>No data</p>;
  const max = Math.max(...data.map(d => d[valueKey]), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...S.mono, fontSize: 11, color: "var(--text-muted)", width: 100, flexShrink: 0, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d[labelKey]}
          </span>
          <div style={{ flex: 1, height: 20, background: "var(--bg-tertiary)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              width: `${(d[valueKey] / max) * 100}%`, height: "100%",
              background: color, borderRadius: 4, minWidth: d[valueKey] > 0 ? 4 : 0,
              transition: "width 0.3s ease",
            }} />
          </div>
          <span style={{ ...S.mono, fontSize: 11, color: "var(--text-secondary)", width: 70, flexShrink: 0 }}>
            {formatValue ? formatValue(d[valueKey]) : d[valueKey]}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage({ onBack }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/dashboard/stats").then(data => {
      if (data) setStats(data);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div style={{ padding: 20 }}>
      <p style={{ ...S.mono, color: "var(--text-muted)", fontSize: 13 }}>Loading dashboard...</p>
    </div>
  );

  const chartCard = { background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: 12, padding: 20 };
  const chartTitle = { ...S.mono, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text-muted)", marginBottom: 16 };

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{
          ...S.mono, background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)",
          borderRadius: 7, padding: "7px 12px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer",
        }}>{"\u2190"} Back</button>
        <h2 style={{ ...S.mono, fontSize: 18, fontWeight: 700 }}>Dashboard</h2>
        <div style={{ flex: 1 }} />
        <a href="/api/dashboard/spend-report.csv" style={{
          ...S.mono, background: "var(--accent)", color: "#fff", textDecoration: "none",
          borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 600,
        }}>{"↓"} Export spend report (CSV)</a>
      </div>

      {/* Order Stat Cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <StatCard label="Total Orders" value={stats?.total} />
        <StatCard label="Active" value={stats?.active} color="var(--accent)" />
        <StatCard label="Delivered" value={stats?.delivered} color="var(--success)" />
        <StatCard label="Stale" value={stats?.stale} color="var(--danger)" />
        <StatCard label="Avg Delivery" value={stats?.avgDeliveryDays ? `${stats.avgDeliveryDays}d` : "\u2014"} />
      </div>

      {/* Budget Stat Cards */}
      {stats?.totalSpent > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
          <StatCard label="Total Spent" value={formatCurrency(stats.totalSpent)} color="var(--accent)" />
          <StatCard label="Avg Cost/Order" value={stats.total > 0 ? formatCurrency(stats.totalSpent / stats.total) : "\u2014"} />
          {stats?.highestOrderCost && (
            <StatCard label="Highest Order" value={formatCurrency(stats.highestOrderCost.total_cost)} color="#f59e0b" />
          )}
        </div>
      )}

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={chartCard}>
          <h3 style={chartTitle}>Orders by Month</h3>
          <BarChart data={stats?.byMonth} labelKey="month" valueKey="count" color="var(--accent)" />
        </div>

        <div style={chartCard}>
          <h3 style={chartTitle}>Orders by Category</h3>
          <BarChart data={stats?.byCategory} labelKey="category" valueKey="count" color="var(--success)" />
        </div>

        {stats?.spentByCategory?.length > 0 && (
          <div style={chartCard}>
            <h3 style={chartTitle}>Spending by Category</h3>
            <BarChart data={stats.spentByCategory} labelKey="category" valueKey="total" color="#f59e0b" formatValue={v => formatCurrency(v)} />
          </div>
        )}

        {stats?.spentByMonth?.length > 0 && (
          <div style={chartCard}>
            <h3 style={chartTitle}>Spending by Month</h3>
            <BarChart data={stats.spentByMonth} labelKey="month" valueKey="total" color="#f59e0b" formatValue={v => formatCurrency(v)} />
          </div>
        )}

        {stats?.deliveryTimeTrend?.length > 0 && (
          <div style={chartCard}>
            <h3 style={chartTitle}>Delivery Time Trend</h3>
            <BarChart data={stats.deliveryTimeTrend} labelKey="month" valueKey="avg_days" color="#a855f7" formatValue={v => `${v}d`} />
          </div>
        )}

        <div style={chartCard}>
          <h3 style={chartTitle}>Orders by User</h3>
          <BarChart data={stats?.byUser} labelKey="user" valueKey="count" color="#a855f7" />
        </div>

        <div style={chartCard}>
          <h3 style={chartTitle}>Orders by Department</h3>
          <BarChart data={stats?.byDepartment} labelKey="department" valueKey="count" color="var(--accent)" />
        </div>

        {stats?.spentByDepartment?.length > 0 && (
          <div style={chartCard}>
            <h3 style={chartTitle}>Spending by Department</h3>
            <BarChart data={stats.spentByDepartment} labelKey="department" valueKey="total" color="#f59e0b" formatValue={v => formatCurrency(v)} />
          </div>
        )}

        {stats?.spentByVendor?.length > 0 && (
          <div style={chartCard}>
            <h3 style={chartTitle}>Spending by Vendor</h3>
            <BarChart data={stats.spentByVendor} labelKey="vendor" valueKey="total" color="#f59e0b" formatValue={v => formatCurrency(v)} />
          </div>
        )}

        <div style={chartCard}>
          <h3 style={chartTitle}>Orders by Requester</h3>
          <BarChart data={stats?.byRequester} labelKey="requester" valueKey="count" color="#10b981" />
        </div>
      </div>

      {/* Overdue Orders */}
      {stats?.overdueOrders?.length > 0 && (
        <div style={{ ...chartCard, marginTop: 20 }}>
          <h3 style={chartTitle}>Overdue Orders</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {stats.overdueOrders.map(o => (
              <div key={o.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px", background: "var(--danger-bg)", borderRadius: 6,
                border: "1px solid var(--danger-border)",
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{o.name}</span>
                <span style={{ ...S.mono, fontSize: 11, color: "var(--danger)", fontWeight: 600 }}>
                  {daysSince(o.last_updated || o.date)}d waiting
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recurring Orders */}
      {stats?.recurringOrders?.length > 0 && (
        <div style={{ ...chartCard, marginTop: 20 }}>
          <h3 style={chartTitle}>Recurring Orders</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr",
              padding: "6px 12px", borderBottom: "1px solid var(--border-primary)",
            }}>
              <span style={{ ...S.mono, fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>Item</span>
              <span style={{ ...S.mono, fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "right" }}>Times Ordered</span>
              <span style={{ ...S.mono, fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "right" }}>Total Qty</span>
              <span style={{ ...S.mono, fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", textAlign: "right" }}>Total Spent</span>
            </div>
            {stats.recurringOrders.map((r, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr",
                padding: "8px 12px", background: i % 2 === 0 ? "var(--bg-secondary)" : "transparent",
                borderRadius: 4,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ ...S.mono, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>{r.times_ordered}</span>
                <span style={{ ...S.mono, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>{r.total_qty}</span>
                <span style={{ ...S.mono, fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>{r.total_spent > 0 ? formatCurrency(r.total_spent) : "\u2014"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
