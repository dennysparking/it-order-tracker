import { useState, useEffect } from 'react';
import { api } from '../api';
import { S } from '../styles';

export default function SettingsModal({ settings, user, categories = [], departments = [], onSave, onCategoriesChange, onDepartmentsChange, onClose }) {
  const [values, setValues] = useState({ ...settings });
  const [tab, setTab] = useState("general");
  const [users, setUsers] = useState([]);
  const [catList, setCatList] = useState(categories);
  const [newCat, setNewCat] = useState("");
  const [deptList, setDeptList] = useState(departments);
  const [newDept, setNewDept] = useState("");
  const [newUser, setNewUser] = useState({ username: "", password: "", displayName: "", role: "user" });
  const [pwForm, setPwForm] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState("");
  const [templates, setTemplates] = useState([]);
  const [editTpl, setEditTpl] = useState(null);
  const [tplForm, setTplForm] = useState({ name: "", subject: "", body: "", category: "", is_default: false });

  useEffect(() => {
    if (user.role === "admin") api.get("/api/users").then(u => u && setUsers(u));
    api.get("/api/email-templates").then(t => t && setTemplates(t));
  }, []);

  const set = (k, v) => setValues(prev => ({ ...prev, [k]: v }));

  const tabBtn = (key, label) => (
    <button key={key} onClick={() => setTab(key)} style={{
      ...S.mono, background: tab === key ? "var(--accent-bg)" : "transparent",
      color: tab === key ? "var(--accent)" : "var(--text-secondary)",
      border: tab === key ? "1px solid var(--accent-border)" : "1px solid var(--border-primary)",
      borderRadius: 6, padding: "6px 12px", fontSize: 11, cursor: "pointer",
    }}>{label}</button>
  );

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={{ ...S.modalBox, maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ ...S.mono, fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Settings</h2>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {tabBtn("general", "General")}
          {tabBtn("email", "Email Template")}
          {tabBtn("recipients", "Recipients")}
          {user.role === "admin" && tabBtn("smtp", "SMTP / Notifications")}
          {user.role === "admin" && tabBtn("categories", "Categories")}
          {user.role === "admin" && tabBtn("departments", "Departments")}
          {tabBtn("account", "Account")}
          {user.role === "admin" && tabBtn("users", "Users")}
        </div>

        {msg && <div style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "var(--success)" }}>{msg}</div>}

        {tab === "general" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={S.label}>Purchaser Email</label>
              <input style={S.input} value={values.purchaser_email || ""} onChange={e => set("purchaser_email", e.target.value)}
                placeholder="purchasing@company.com" />
              <p style={{ fontSize: 11, color: "var(--text-dimmed)", marginTop: 4 }}>Auto-fills the "To" field in generated emails.</p>
            </div>
            <div>
              <label style={S.label}>Stale After (days)</label>
              <input style={{ ...S.input, width: 80 }} type="number" min={1} max={60}
                value={values.stale_days || 5} onChange={e => set("stale_days", e.target.value)} />
            </div>
            {user.role === "admin" && (
              <div style={{ borderTop: "1px solid var(--border-primary)", paddingTop: 14, marginTop: 4 }}>
                <p style={{ ...S.mono, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>IMAGE CACHE</p>
                <p style={{ fontSize: 11, color: "var(--text-dimmed)", marginBottom: 8 }}>Fetch and cache product images for all orders that don't have one yet.</p>
                <button onClick={async () => {
                  setMsg("Refreshing images...");
                  const res = await api.post("/api/orders/refresh-images");
                  setMsg(res?.success ? `Done! Updated ${res.updated} of ${res.total} orders.` : (res?.error || "Failed"));
                }} style={{ ...S.btnGhost, ...S.mono, fontSize: 11 }}>Refresh All Images</button>
              </div>
            )}
          </div>
        )}

        {tab === "email" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Quick settings-based template (legacy) */}
            <div>
              <label style={S.label}>Default Subject</label>
              <input style={S.input} value={values.email_template_subject || ""} onChange={e => set("email_template_subject", e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Default Body</label>
              <textarea style={{ ...S.input, minHeight: 100, resize: "vertical", ...S.mono, fontSize: 12 }}
                value={values.email_template_body || ""} onChange={e => set("email_template_body", e.target.value)} />
            </div>
            <p style={{ fontSize: 11, color: "var(--text-dimmed)" }}>
              Variables: {"{{item_name}}"}, {"{{quantity}}"}, {"{{link}}"}, {"{{notes}}"}. Use \n for line breaks.
            </p>

            {/* Saved Templates */}
            {user.role === "admin" && (
              <div style={{ borderTop: "1px solid var(--border-primary)", paddingTop: 14, marginTop: 4 }}>
                <p style={{ ...S.mono, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>SAVED TEMPLATES</p>
                {templates.map(t => (
                  <div key={t.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12,
                  }}>
                    <div>
                      <strong>{t.name}</strong>
                      {t.is_default ? <span style={{ ...S.mono, fontSize: 9, color: "var(--success)", marginLeft: 6 }}>DEFAULT</span> : null}
                      {t.category && <span style={{ ...S.mono, fontSize: 9, color: "var(--accent)", marginLeft: 6 }}>{t.category}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => {
                        setEditTpl(t.id);
                        setTplForm({ name: t.name, subject: t.subject, body: t.body, category: t.category || "", is_default: !!t.is_default });
                      }} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11 }}>Edit</button>
                      <button onClick={async () => {
                        await api.del(`/api/email-templates/${t.id}`);
                        setTemplates(prev => prev.filter(x => x.id !== t.id));
                      }} style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 11 }}>{"\u2715"}</button>
                    </div>
                  </div>
                ))}

                {/* Add/Edit Template Form */}
                <div style={{ background: "var(--bg-secondary)", borderRadius: 8, padding: 12, marginTop: 10, border: "1px solid var(--border-primary)" }}>
                  <p style={{ ...S.mono, fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>
                    {editTpl ? "EDIT TEMPLATE" : "ADD TEMPLATE"}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input style={{ ...S.input, flex: 1 }} placeholder="Template name" value={tplForm.name}
                        onChange={e => setTplForm(p => ({ ...p, name: e.target.value }))} />
                      <select style={{ ...S.input, width: 120 }} value={tplForm.category}
                        onChange={e => setTplForm(p => ({ ...p, category: e.target.value }))}>
                        <option value="">Global</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <input style={S.input} placeholder="Subject" value={tplForm.subject}
                      onChange={e => setTplForm(p => ({ ...p, subject: e.target.value }))} />
                    <textarea style={{ ...S.input, minHeight: 80, resize: "vertical", ...S.mono, fontSize: 11 }}
                      placeholder="Body" value={tplForm.body}
                      onChange={e => setTplForm(p => ({ ...p, body: e.target.value }))} />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
                      <input type="checkbox" checked={tplForm.is_default}
                        onChange={e => setTplForm(p => ({ ...p, is_default: e.target.checked }))} />
                      Set as default{tplForm.category ? ` for ${tplForm.category}` : ""}
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={async () => {
                        if (!tplForm.name || !tplForm.subject || !tplForm.body) return;
                        if (editTpl) {
                          await api.put(`/api/email-templates/${editTpl}`, tplForm);
                        } else {
                          await api.post("/api/email-templates", tplForm);
                        }
                        const updated = await api.get("/api/email-templates");
                        if (updated) setTemplates(updated);
                        setEditTpl(null);
                        setTplForm({ name: "", subject: "", body: "", category: "", is_default: false });
                      }} style={{ ...S.btnPrimary, padding: "6px 14px", fontSize: 11 }}>{editTpl ? "Update" : "Add"}</button>
                      {editTpl && <button onClick={() => {
                        setEditTpl(null);
                        setTplForm({ name: "", subject: "", body: "", category: "", is_default: false });
                      }} style={{ ...S.btnGhost, padding: "6px 14px", fontSize: 11 }}>Cancel</button>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "recipients" && (() => {
          const FIXED = ["Tami", "Desiree", "Stacey"];
          let recipientEmails = {"Tami.Hockemeyer@copperworks.com": "Tami", "Desiree.Elett@copperworks.com": "Desiree", "Stacey.Garton@copperworks.com": "Stacey"};
          try { recipientEmails = JSON.parse(values.recipient_emails || "{}"); } catch {}
          const setEmail = (name, email) => set("recipient_emails", JSON.stringify({ ...recipientEmails, [name]: email }));
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Set email addresses for each recipient. These will be added to the CC field when sending order emails.
              </p>
              {FIXED.map(name => (
                <div key={name}>
                  <label style={S.label}>{name}</label>
                  <input style={S.input} type="email" value={recipientEmails[name] || ""}
                    onChange={e => setEmail(name, e.target.value)}
                    placeholder={`${name.toLowerCase()}@company.com`} />
                </div>
              ))}
            </div>
          );
        })()}

        {tab === "smtp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Configure SMTP to receive email reminders when orders need follow-up.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={S.label}>SMTP Host</label>
                <input style={S.input} value={values.smtp_host || ""} onChange={e => set("smtp_host", e.target.value)}
                  placeholder="smtp.company.com" />
              </div>
              <div>
                <label style={S.label}>Port</label>
                <input style={S.input} type="number" value={values.smtp_port || "587"} onChange={e => set("smtp_port", e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Secure (TLS)</label>
                <select style={S.input} value={values.smtp_secure || "false"} onChange={e => set("smtp_secure", e.target.value)}>
                  <option value="false">No (STARTTLS)</option>
                  <option value="true">Yes (TLS)</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Username</label>
                <input style={S.input} value={values.smtp_user || ""} onChange={e => set("smtp_user", e.target.value)}
                  placeholder="user@company.com" />
              </div>
              <div>
                <label style={S.label}>Password</label>
                <input style={S.input} type="password" value={values.smtp_pass || ""} onChange={e => set("smtp_pass", e.target.value)}
                  placeholder="password" />
              </div>
              <div>
                <label style={S.label}>From Address</label>
                <input style={S.input} value={values.smtp_from || ""} onChange={e => set("smtp_from", e.target.value)}
                  placeholder="it-orders@company.com" />
              </div>
              <div>
                <label style={S.label}>Notification Recipient</label>
                <input style={S.input} value={values.notification_email || ""} onChange={e => set("notification_email", e.target.value)}
                  placeholder="you@company.com" />
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--border-primary)", paddingTop: 14, marginTop: 4 }}>
              <p style={{ ...S.mono, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>FOLLOW-UP REMINDERS</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={S.label}>Remind after (days)</label>
                  <input style={{ ...S.input, width: 80 }} type="number" min={1} max={60}
                    value={values.followup_reminder_days || "3"} onChange={e => set("followup_reminder_days", e.target.value)} />
                  <p style={{ fontSize: 11, color: "var(--text-dimmed)", marginTop: 4 }}>Days since last update before sending a reminder.</p>
                </div>
                <div>
                  <label style={S.label}>Check at (hour)</label>
                  <input style={{ ...S.input, width: 80 }} type="number" min={0} max={23}
                    value={values.followup_cron_hour || "8"} onChange={e => set("followup_cron_hour", e.target.value)} />
                  <p style={{ fontSize: 11, color: "var(--text-dimmed)", marginTop: 4 }}>Hour of day (24h) to run the check. Requires server restart.</p>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={async () => {
                const res = await api.post("/api/settings/test-email");
                setMsg(res?.success ? "Test email sent!" : (res?.error || "Failed to send test email"));
              }} style={{ ...S.btnGhost, ...S.mono, fontSize: 11 }}>Send Test Email</button>
              <button onClick={async () => {
                const res = await api.post("/api/settings/run-followup-check");
                setMsg(res?.success ? "Follow-up check triggered." : (res?.error || "Failed"));
              }} style={{ ...S.btnGhost, ...S.mono, fontSize: 11 }}>Run Follow-up Check Now</button>
            </div>
          </div>
        )}

        {tab === "categories" && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {catList.map((cat, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", background: "var(--bg-secondary)", border: "1px solid var(--border-primary)",
                  borderRadius: 8, fontSize: 13,
                }}>
                  <span>{cat}</span>
                  <button onClick={() => {
                    const updated = catList.filter((_, j) => j !== i);
                    setCatList(updated);
                    api.put("/api/categories", { categories: updated }).then(() => onCategoriesChange(updated));
                  }} style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 12, opacity: 0.6 }}>{"\u2715"}</button>
                </div>
              ))}
              {catList.length === 0 && (
                <p style={{ ...S.mono, fontSize: 12, color: "var(--text-muted)", padding: 12 }}>No categories yet.</p>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...S.input, flex: 1 }} placeholder="New category name" value={newCat}
                onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newCat.trim()) {
                    const updated = [...catList, newCat.trim()];
                    setCatList(updated);
                    setNewCat("");
                    api.put("/api/categories", { categories: updated }).then(() => onCategoriesChange(updated));
                  }
                }} />
              <button onClick={() => {
                if (!newCat.trim()) return;
                const updated = [...catList, newCat.trim()];
                setCatList(updated);
                setNewCat("");
                api.put("/api/categories", { categories: updated }).then(() => onCategoriesChange(updated));
              }} style={{ ...S.btnPrimary, padding: "10px 16px" }}>Add</button>
            </div>
          </div>
        )}

        {tab === "departments" && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {deptList.map((dept, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", background: "var(--bg-secondary)", border: "1px solid var(--border-primary)",
                  borderRadius: 8, fontSize: 13,
                }}>
                  <span>{dept}</span>
                  <button onClick={() => {
                    const updated = deptList.filter((_, j) => j !== i);
                    setDeptList(updated);
                    api.put("/api/departments", { departments: updated }).then(() => onDepartmentsChange(updated));
                  }} style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 12, opacity: 0.6 }}>{"\u2715"}</button>
                </div>
              ))}
              {deptList.length === 0 && (
                <p style={{ ...S.mono, fontSize: 12, color: "var(--text-muted)", padding: 12 }}>No departments yet.</p>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...S.input, flex: 1 }} placeholder="New department name" value={newDept}
                onChange={e => setNewDept(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newDept.trim()) {
                    const updated = [...deptList, newDept.trim()];
                    setDeptList(updated);
                    setNewDept("");
                    api.put("/api/departments", { departments: updated }).then(() => onDepartmentsChange(updated));
                  }
                }} />
              <button onClick={() => {
                if (!newDept.trim()) return;
                const updated = [...deptList, newDept.trim()];
                setDeptList(updated);
                setNewDept("");
                api.put("/api/departments", { departments: updated }).then(() => onDepartmentsChange(updated));
              }} style={{ ...S.btnPrimary, padding: "10px 16px" }}>Add</button>
            </div>
          </div>
        )}

        {tab === "account" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Logged in as <strong>{user.displayName || user.username}</strong> ({user.role})</p>
            <div>
              <label style={S.label}>Current Password</label>
              <input style={S.input} type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>New Password</label>
              <input style={S.input} type="password" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} />
            </div>
            <button onClick={async () => {
              const res = await api.post("/api/auth/change-password", { currentPassword: pwForm.current, newPassword: pwForm.next });
              if (res?.success) { setMsg("Password changed!"); setPwForm({ current: "", next: "" }); }
              else setMsg(res?.error || "Failed");
            }} style={{ ...S.btnPrimary, alignSelf: "flex-start" }}>Change Password</button>
          </div>
        )}

        {tab === "users" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              {users.map(u => (
                <div key={u.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 13,
                }}>
                  <div>
                    <strong>{u.display_name || u.username}</strong>
                    <span style={{ ...S.mono, fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>@{u.username} {"\u00b7"} {u.role}</span>
                  </div>
                  {u.id !== user.id && (
                    <button onClick={async () => {
                      if (confirm(`Delete user ${u.username}?`)) {
                        await api.del(`/api/users/${u.id}`);
                        setUsers(users.filter(x => x.id !== u.id));
                      }
                    }} style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 12 }}>{"\u2715"}</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: 14, border: "1px solid var(--border-primary)" }}>
              <p style={{ ...S.mono, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>ADD USER</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={{ ...S.input, flex: 1, minWidth: 100 }} placeholder="Username"
                  value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} />
                <input style={{ ...S.input, flex: 1, minWidth: 100 }} placeholder="Password" type="password"
                  value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
                <select style={{ ...S.input, width: 90 }} value={newUser.role}
                  onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button onClick={async () => {
                  const res = await api.post("/api/users", newUser);
                  if (res?.success) {
                    const updated = await api.get("/api/users");
                    if (updated) setUsers(updated);
                    setNewUser({ username: "", password: "", displayName: "", role: "user" });
                  } else setMsg(res?.error || "Failed");
                }} style={{ ...S.btnPrimary, padding: "10px 16px" }}>Add</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={S.btnGhost}>Cancel</button>
          <button onClick={() => { onSave(values); onClose(); }} style={S.btnPrimary}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}
