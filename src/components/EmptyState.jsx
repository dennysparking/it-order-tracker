import { S } from '../styles';

export default function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-dimmed)" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{"\ud83d\udce6"}</div>
      <p style={{ ...S.mono, fontSize: 14 }}>No orders yet. Click <strong style={{ color: "var(--accent)" }}>+ New Order</strong> to get started.</p>
      <p style={{ fontSize: 12, marginTop: 8 }}>Tip: Set your purchaser email in {"\u2699"} Settings first.</p>
    </div>
  );
}
