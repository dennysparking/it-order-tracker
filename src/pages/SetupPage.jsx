import { useState } from 'react';
import { api } from '../api';
import { S } from '../styles';

export default function SetupPage({ onComplete }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!username || !password) return setError("Username and password required");
    const res = await api.post("/api/auth/setup", { username, password, displayName });
    if (res?.success) onComplete();
    else setError(res?.error || "Setup failed");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ ...S.modalBox, maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px",
            background: "linear-gradient(135deg, #3b82f6, #6366f1)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
          }}>{"\u26a1"}</div>
          <h1 style={{ ...S.mono, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>IT Order Tracker</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Create your admin account to get started.</p>
        </div>
        {error && <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--danger)" }}>{error}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={S.label}>Display Name</label>
            <input style={S.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label style={S.label}>Username</label>
            <input style={S.input} value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" autoFocus />
          </div>
          <div>
            <label style={S.label}>Password</label>
            <input style={S.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
              onKeyDown={e => e.key === "Enter" && handleSubmit()} />
          </div>
          <button onClick={handleSubmit} style={{ ...S.btnPrimary, marginTop: 8, width: "100%" }}>Create Admin Account</button>
        </div>
      </div>
    </div>
  );
}
