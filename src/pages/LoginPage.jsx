import { useState } from 'react';
import { api } from '../api';
import { S } from '../styles';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    const res = await api.post("/api/auth/login", { username, password });
    if (res?.user) onLogin(res.user);
    else setError(res?.error || "Login failed");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ ...S.modalBox, maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px",
            background: "linear-gradient(135deg, #3b82f6, #6366f1)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
          }}>{"\u26a1"}</div>
          <h1 style={{ ...S.mono, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>IT Order Tracker</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Sign in to continue.</p>
        </div>
        {error && <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--danger)" }}>{error}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={S.label}>Username</label>
            <input style={S.input} value={username} onChange={e => setUsername(e.target.value)} autoFocus />
          </div>
          <div>
            <label style={S.label}>Password</label>
            <input style={S.input} type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          <button onClick={handleLogin} style={{ ...S.btnPrimary, marginTop: 8, width: "100%" }}>Sign In</button>
        </div>
      </div>
    </div>
  );
}
