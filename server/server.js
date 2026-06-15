const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const dns = require("dns");
const net = require("net");
const { URL } = require("url");
const nodemailer = require("nodemailer");
const cron = require("node-cron");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production-" + Math.random().toString(36).slice(2);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "orders.db");

if (!process.env.JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET not set. Using random secret — all sessions will invalidate on restart.");
}

// ── Database Setup ──
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    link TEXT,
    image_url TEXT,
    quantity INTEGER DEFAULT 1,
    notes TEXT,
    date TEXT NOT NULL,
    last_updated TEXT,
    email_sent INTEGER DEFAULT 0,
    email_replied INTEGER DEFAULT 0,
    followup INTEGER DEFAULT 0,
    delivered INTEGER DEFAULT 0,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Ensure default settings exist
const ensureSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
ensureSetting.run("purchaser_email", "");
ensureSetting.run("stale_days", "5");
ensureSetting.run("email_template_subject", "IT Order Request: {{item_name}}");
ensureSetting.run("email_template_body", "Hi,\\n\\nPlease process the following IT order:\\n\\nItem: {{item_name}}\\nQuantity: {{quantity}}\\nLink: {{link}}\\n{{notes}}\\nThank you.");
ensureSetting.run("smtp_host", "");
ensureSetting.run("smtp_port", "587");
ensureSetting.run("smtp_user", "");
ensureSetting.run("smtp_pass", "");
ensureSetting.run("smtp_from", "");
ensureSetting.run("smtp_secure", "false");
ensureSetting.run("notification_email", "");
ensureSetting.run("followup_reminder_days", "3");
ensureSetting.run("followup_cron_hour", "8");

// ── Schema Migrations ──
const CURRENT_SCHEMA_VERSION = 16;
const currentVersion = parseInt(
  db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get()?.value || "0"
);

if (currentVersion < 1) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      changes TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
  `);
}

if (currentVersion < 2) {
  // Check if column already exists before adding
  const cols = db.pragma("table_info(orders)").map(c => c.name);
  if (!cols.includes("category")) {
    db.exec(`ALTER TABLE orders ADD COLUMN category TEXT DEFAULT NULL`);
  }
  ensureSetting.run("categories", '["Hardware","Software","Peripherals","Networking","Other"]');
}

if (currentVersion < 3) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      data BLOB,
      uploaded_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_order ON attachments(order_id);

    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate existing email template from settings to email_templates table
  const existingSubject = db.prepare("SELECT value FROM settings WHERE key = 'email_template_subject'").get();
  const existingBody = db.prepare("SELECT value FROM settings WHERE key = 'email_template_body'").get();
  if (existingSubject && existingBody) {
    db.prepare("INSERT OR IGNORE INTO email_templates (id, name, subject, body, is_default) VALUES (1, 'Default Template', ?, ?, 1)")
      .run(existingSubject.value, existingBody.value);
  }
}

if (currentVersion < 4) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      entity_type TEXT,
      entity_id TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
  `);
}

if (currentVersion < 5) {
  const cols = db.prepare("pragma table_info(orders)").all().map(c => c.name);
  if (!cols.includes("last_reminder_sent")) {
    db.exec(`ALTER TABLE orders ADD COLUMN last_reminder_sent TEXT DEFAULT NULL`);
  }
}

if (currentVersion < 6) {
  const cols = db.pragma("table_info(orders)").map(c => c.name);
  if (!cols.includes("unit_cost")) {
    db.exec(`ALTER TABLE orders ADD COLUMN unit_cost REAL DEFAULT NULL`);
  }
}

if (currentVersion < 7) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      user_id INTEGER,
      username TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_order ON comments(order_id, created_at);
  `);
}

if (currentVersion < 8) {
  const cols = db.pragma("table_info(orders)").map(c => c.name);
  if (!cols.includes("archived")) {
    db.exec(`ALTER TABLE orders ADD COLUMN archived INTEGER DEFAULT 0`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_archived ON orders(archived)`);
  }
}

if (currentVersion < 9) {
  const cols = db.pragma("table_info(orders)").map(c => c.name);
  if (!cols.includes("requested_by")) {
    db.exec(`ALTER TABLE orders ADD COLUMN requested_by TEXT DEFAULT NULL`);
  }
}

if (currentVersion < 10) {
  const cols = db.pragma("table_info(orders)").map(c => c.name);
  if (!cols.includes("department")) {
    db.exec(`ALTER TABLE orders ADD COLUMN department TEXT DEFAULT NULL`);
  }
  ensureSetting.run("departments", '["Sales","Marketing","Engineering","Finance","HR","Operations","Support","Executive"]');
}

if (currentVersion < 11) {
  const cols = db.pragma("table_info(orders)").map(c => c.name);
  if (!cols.includes("recipients")) {
    db.exec(`ALTER TABLE orders ADD COLUMN recipients TEXT DEFAULT NULL`);
  }
}

if (currentVersion < 12) {
  const cols = db.pragma("table_info(orders)").map(c => c.name);
  if (!cols.includes("cc_recipients")) {
    db.exec(`ALTER TABLE orders ADD COLUMN cc_recipients TEXT DEFAULT NULL`);
  }
}

if (currentVersion < 13) {
  const cols = db.pragma("table_info(orders)").map(c => c.name);
  if (!cols.includes("confirm_token")) {
    db.exec(`ALTER TABLE orders ADD COLUMN confirm_token TEXT DEFAULT NULL`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_confirm_token ON orders(confirm_token) WHERE confirm_token IS NOT NULL`);
  }
  if (!cols.includes("confirmed_at")) {
    db.exec(`ALTER TABLE orders ADD COLUMN confirmed_at TEXT DEFAULT NULL`);
  }
  ensureSetting.run("it_alert_emails", "");
}

if (currentVersion < 14) {
  const cols = db.pragma("table_info(orders)").map(c => c.name);
  if (!cols.includes("status")) {
    db.exec(`ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'requested'`);
    // Migrate existing boolean flags → status
    db.exec(`UPDATE orders SET status = CASE
      WHEN delivered = 1 THEN 'delivered'
      WHEN followup = 1  THEN 'shipped'
      WHEN email_replied = 1 THEN 'ordered'
      WHEN email_sent = 1    THEN 'sent_to_purchaser'
      ELSE 'requested'
    END`);
  }
  if (!cols.includes("is_bulk")) {
    db.exec(`ALTER TABLE orders ADD COLUMN is_bulk INTEGER DEFAULT 0`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      name TEXT NOT NULL,
      link TEXT,
      image_url TEXT,
      quantity INTEGER DEFAULT 1,
      unit_cost REAL,
      status TEXT DEFAULT 'requested',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  `);
}

if (currentVersion < 15) {
  const cols = db.pragma("table_info(orders)").map(c => c.name);
  if (!cols.includes("vendor")) {
    db.exec(`ALTER TABLE orders ADD COLUMN vendor TEXT DEFAULT NULL`);
  }
}

if (currentVersion < 16) {
  // "Requested" stage removed — orders now start at "Sent to Purchaser"
  db.exec(`UPDATE orders SET status = 'sent_to_purchaser' WHERE status = 'requested' OR status IS NULL`);
  db.exec(`UPDATE order_items SET status = 'sent_to_purchaser' WHERE status = 'requested' OR status IS NULL`);
}

db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)")
  .run("16");

// ── Status Helpers ──
const STAGE_KEYS = ["sent_to_purchaser","ordered","partially_shipped","shipped","partially_delivered","delivered","completed"];

function statusToBooleans(status) {
  const idx = STAGE_KEYS.indexOf(status || "sent_to_purchaser");
  return {
    email_sent:    idx >= STAGE_KEYS.indexOf("sent_to_purchaser") ? 1 : 0,
    email_replied: idx >= STAGE_KEYS.indexOf("ordered")           ? 1 : 0,
    followup:      idx >= STAGE_KEYS.indexOf("partially_shipped") ? 1 : 0,
    delivered:     idx >= STAGE_KEYS.indexOf("delivered")         ? 1 : 0,
  };
}

// Roll a bulk order's parent status up from its sub-items' statuses.
// The parent reflects the least-advanced item, but surfaces "partially_*" when items are split
// across the shipped/delivered boundaries (e.g. some shipped, some not → Partially Shipped).
function rollupBulkStatus(statuses) {
  if (!statuses.length) return null;
  const idxs = statuses.map(s => { const i = STAGE_KEYS.indexOf(s); return i < 0 ? 0 : i; });
  const min = Math.min(...idxs), max = Math.max(...idxs);
  const deliveredIdx = STAGE_KEYS.indexOf("delivered");
  const shippedIdx = STAGE_KEYS.indexOf("shipped");
  if (min === max) return STAGE_KEYS[min];          // all items at the same stage
  if (min >= deliveredIdx) return "delivered";      // everything delivered (or completed)
  if (max >= deliveredIdx) return "partially_delivered";
  if (max >= shippedIdx) return "partially_shipped";
  return STAGE_KEYS[min];                            // spread within early stages → least advanced
}

function recomputeBulkParentStatus(orderId) {
  const items = db.prepare("SELECT status FROM order_items WHERE order_id = ?").all(orderId);
  if (!items.length) return;
  const status = rollupBulkStatus(items.map(it => it.status));
  if (!status) return;
  const b = statusToBooleans(status);
  const now = new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE orders SET status=?, email_sent=?, email_replied=?, followup=?, delivered=?, last_updated=? WHERE id=?")
    .run(status, b.email_sent, b.email_replied, b.followup, b.delivered, now, orderId);
}

// ── Audit Log Helper ──
function logAudit(userId, username, action, entityType, entityId, changes) {
  db.prepare(
    "INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, changes) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(userId, username, action, entityType, entityId, changes ? JSON.stringify(changes) : null);
}

// ── Notification Helper ──
function createNotification(userId, type, title, message, entityType, entityId) {
  db.prepare(
    "INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(userId, type, title, message, entityType || null, entityId || null);
}

// Notify all other users about order changes
function notifyOrderChange(actorId, actorUsername, action, order) {
  const users = db.prepare("SELECT id FROM users WHERE id != ?").all(actorId);
  const title = `Order ${action}: ${order.name}`;
  const message = `${actorUsername} ${action} "${order.name}"`;
  for (const u of users) {
    createNotification(u.id, "order_update", title, message, "order", order.id || null);
  }
}

// ── SMTP Helpers ──
function getSmtpTransporter() {
  const getSetting = (key) => db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value || "";
  const host = getSetting("smtp_host");
  const port = parseInt(getSetting("smtp_port")) || 587;
  const user = getSetting("smtp_user");
  const pass = getSetting("smtp_pass");
  const secure = getSetting("smtp_secure") === "true";
  if (!host) return null;
  return nodemailer.createTransport({
    host, port, secure,
    auth: user ? { user, pass } : undefined,
    tls: { rejectUnauthorized: false },
  });
}

function getSmtpFrom() {
  return db.prepare("SELECT value FROM settings WHERE key = 'smtp_from'").get()?.value || "";
}

function getNotificationEmail() {
  return db.prepare("SELECT value FROM settings WHERE key = 'notification_email'").get()?.value || "";
}

function buildFollowupEmailHtml(order, daysSinceUpdate) {
  const stages = [
    { key: "delivered", label: "Delivered" },
    { key: "followup", label: "Follow-up" },
    { key: "email_replied", label: "Replied" },
    { key: "email_sent", label: "Email Sent" },
  ];
  let stageName = "Inbox";
  for (const s of stages) { if (order[s.key]) { stageName = s.label; break; } }

  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e293b; margin-bottom: 16px;">Follow-up Reminder</h2>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <p style="margin: 0 0 8px; font-weight: 600; font-size: 16px;">${order.name}</p>
        <p style="margin: 0 0 4px; color: #64748b; font-size: 13px;">Stage: <strong>${stageName}</strong></p>
        <p style="margin: 0 0 4px; color: #64748b; font-size: 13px;">Days waiting: <strong>${daysSinceUpdate}</strong></p>
        ${order.quantity > 1 ? `<p style="margin: 0 0 4px; color: #64748b; font-size: 13px;">Quantity: ${order.quantity}</p>` : ""}
        ${order.notes ? `<p style="margin: 0 0 4px; color: #64748b; font-size: 13px;">Notes: ${order.notes}</p>` : ""}
      </div>
      ${order.link ? `<p><a href="${order.link}" style="color: #3b82f6;">View Product Link</a></p>` : ""}
      <p style="color: #94a3b8; font-size: 11px; margin-top: 20px;">Sent by IT Order Tracker</p>
    </div>
  `;
}

async function sendFollowupReminder(order, daysSinceUpdate) {
  const transporter = getSmtpTransporter();
  if (!transporter) return false;
  const from = getSmtpFrom();
  const to = getNotificationEmail();
  if (!to) return false;
  try {
    await transporter.sendMail({
      from: from || '"IT Order Tracker" <noreply@localhost>',
      to,
      subject: `Follow-up Reminder: ${order.name} (${daysSinceUpdate} days)`,
      html: buildFollowupEmailHtml(order, daysSinceUpdate),
    });
    return true;
  } catch (err) {
    console.error("Failed to send follow-up email:", err.message);
    return false;
  }
}

// ── Follow-up Reminder Scheduler ──
function runFollowupCheck() {
  const reminderDays = parseInt(
    db.prepare("SELECT value FROM settings WHERE key = 'followup_reminder_days'").get()?.value || "3"
  );
  const notificationEmail = getNotificationEmail();
  if (!notificationEmail) return;

  const orders = db.prepare("SELECT * FROM orders WHERE email_sent = 1 AND delivered = 0").all();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  for (const order of orders) {
    const lastDate = order.last_updated || order.date;
    const daysWaiting = Math.floor((now - new Date(lastDate)) / 86400000);
    if (daysWaiting < reminderDays) continue;
    if (order.last_reminder_sent === today) continue;

    sendFollowupReminder(order, daysWaiting).then(sent => {
      if (sent) {
        db.prepare("UPDATE orders SET last_reminder_sent = ? WHERE id = ?").run(today, order.id);
        const users = db.prepare("SELECT id FROM users").all();
        for (const u of users) {
          createNotification(u.id, "followup_reminder", `Follow-up: ${order.name}`,
            `${order.name} has been waiting ${daysWaiting} days. A reminder email was sent.`, "order", order.id);
        }
        console.log(`Sent follow-up reminder for "${order.name}" (${daysWaiting} days)`);
      }
    });
  }
}

const cronHour = parseInt(
  db.prepare("SELECT value FROM settings WHERE key = 'followup_cron_hour'").get()?.value || "8"
);
cron.schedule(`0 ${cronHour} * * *`, () => {
  console.log("Running follow-up reminder check...");
  runFollowupCheck();
});

// ── Database Backup ──
// Online backup of the SQLite database to a dated file. Runs nightly + shortly after startup.
const BACKUP_DIR = path.join(__dirname, "backups");
const BACKUP_RETENTION = 14; // keep the newest N backups
async function runBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dest = path.join(BACKUP_DIR, `orders-${stamp}.db`);
    await db.backup(dest); // consistent online backup even while the DB is in use (WAL)
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("orders-") && f.endsWith(".db"))
      .sort().reverse(); // ISO timestamps sort chronologically; newest first
    for (const old of files.slice(BACKUP_RETENTION)) {
      try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch {}
    }
    console.log(`DB backup written: ${dest} (${Math.min(files.length, BACKUP_RETENTION)} kept)`);
  } catch (err) {
    console.error("DB backup failed:", err.message);
  }
}
cron.schedule("0 2 * * *", () => { console.log("Running nightly DB backup..."); runBackup(); });
setTimeout(runBackup, 10000); // ensure a recent copy exists soon after each restart

// ── Security Helpers ──

function isPrivateIP(ip) {
  if (!net.isIP(ip)) return true; // reject non-IP
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("127.")) return true;
  if (ip === "0.0.0.0" || ip === "::1") return true;
  if (ip.startsWith("169.254.")) return true;
  // 172.16.0.0 - 172.31.255.255
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

const VALID_ORDER_ID = /^[a-zA-Z0-9_-]+$/;

// ── Middleware ──
app.use(express.json());
app.use(cookieParser());

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

// Serve Vite build output in production, fallback for dev
const staticDir = process.env.NODE_ENV === "production"
  ? path.join(__dirname, "dist")
  : path.join(__dirname, "..", "public");
app.use(express.static(staticDir));

// Auth middleware
function authenticate(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin required" });
  next();
}

// ── Auth Routes ──

// Check if setup is needed (no users exist)
app.get("/api/auth/setup-needed", (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as count FROM users").get();
  res.json({ setupNeeded: count.count === 0 });
});

// Initial setup - create first admin user
app.post("/api/auth/setup", (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as count FROM users").get();
  if (count.count > 0) return res.status(400).json({ error: "Setup already complete" });

  const { username, password, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, 'admin')")
    .run(username, hash, displayName || username);

  res.json({ success: true });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ user: { id: user.id, username: user.username, role: user.role, displayName: user.display_name } });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/auth/change-password", authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hash, req.user.id);
  res.json({ success: true });
});

// Admin: manage users
app.get("/api/users", authenticate, requireAdmin, (req, res) => {
  const users = db.prepare("SELECT id, username, display_name, role, created_at FROM users").all();
  res.json(users);
});

app.post("/api/users", authenticate, requireAdmin, (req, res) => {
  const { username, password, displayName, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare("INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)")
      .run(username, hash, displayName || username, role || "user");
    logAudit(req.user.id, req.user.username, "create", "user", String(result.lastInsertRowid), { username, role: role || "user" });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.delete("/api/users/:id", authenticate, requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: "Cannot delete yourself" });
  const target = db.prepare("SELECT username FROM users WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  logAudit(req.user.id, req.user.username, "delete", "user", req.params.id, { username: target?.username });
  res.json({ success: true });
});

// ── Orders API ──

app.get("/api/orders", authenticate, (req, res) => {
  const includeArchived = req.query.include_archived === "1";
  const sql = includeArchived
    ? "SELECT * FROM orders ORDER BY created_at DESC"
    : "SELECT * FROM orders WHERE archived = 0 ORDER BY created_at DESC";
  const orders = db.prepare(sql).all();
  res.json(orders.map(o => ({
    ...o,
    email_sent: !!o.email_sent,
    email_replied: !!o.email_replied,
    followup: !!o.followup,
    delivered: !!o.delivered,
  })));
});

app.post("/api/orders", authenticate, (req, res) => {
  const { id, name, link, image_url, quantity, notes, date, category, unit_cost, requested_by, department, recipients, cc_recipients, confirm_token, status, is_bulk, bulk_items, vendor } = req.body;

  if (id && !VALID_ORDER_ID.test(id)) {
    return res.status(400).json({ error: "Invalid order ID format" });
  }

  const orderId = id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now = new Date().toISOString().slice(0, 10);
  const effectiveStatus = status || "sent_to_purchaser";
  const bools = statusToBooleans(effectiveStatus);

  db.prepare(`INSERT INTO orders (id, name, link, image_url, quantity, notes, date, last_updated, email_sent, email_replied, followup, delivered, created_by, category, unit_cost, requested_by, department, recipients, cc_recipients, confirm_token, status, is_bulk, vendor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(orderId, name, link || null, image_url || null, quantity || 1, notes || null,
      date || now, now, bools.email_sent, bools.email_replied, bools.followup, bools.delivered,
      req.user.username, category || null, unit_cost != null ? unit_cost : null,
      requested_by || null, department || null, recipients || null, cc_recipients || null,
      confirm_token || null, effectiveStatus, is_bulk ? 1 : 0, vendor || null);

  if (Array.isArray(bulk_items) && bulk_items.length > 0) {
    const insertItem = db.prepare(
      "INSERT INTO order_items (order_id, name, link, quantity, unit_cost, status) VALUES (?, ?, ?, ?, ?, 'sent_to_purchaser')"
    );
    for (const it of bulk_items) {
      if (it.name?.trim()) insertItem.run(orderId, it.name.trim(), it.link || null, it.quantity || 1, it.unit_cost != null ? it.unit_cost : null);
    }
  }

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  logAudit(req.user.id, req.user.username, "create", "order", orderId, { name, quantity: quantity || 1 });
  notifyOrderChange(req.user.id, req.user.username, "created", { name, id: orderId });
  res.json({ ...order, email_sent: !!order.email_sent, email_replied: !!order.email_replied, followup: !!order.followup, delivered: !!order.delivered });
});

app.put("/api/orders/:id", authenticate, (req, res) => {
  const oldOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!oldOrder) return res.status(404).json({ error: "Order not found" });

  const { name, link, image_url, quantity, notes, date, category, unit_cost, requested_by, department, recipients, cc_recipients, status, vendor } = req.body;
  const now = new Date().toISOString().slice(0, 10);
  const effectiveStatus = status || oldOrder.status || "sent_to_purchaser";
  const bools = statusToBooleans(effectiveStatus);

  db.prepare(`UPDATE orders SET name=?, link=?, image_url=?, quantity=?, notes=?, date=?, last_updated=?,
    email_sent=?, email_replied=?, followup=?, delivered=?, category=?, unit_cost=?, requested_by=?, department=?,
    recipients=?, cc_recipients=?, status=?, vendor=? WHERE id=?`)
    .run(name, link || null, image_url || null, quantity || 1, notes || null, date, now,
      bools.email_sent, bools.email_replied, bools.followup, bools.delivered, category || null,
      unit_cost != null ? unit_cost : null, requested_by || null, department || null,
      recipients || null, cc_recipients || null, effectiveStatus, vendor || null, req.params.id);

  // Compute diff for audit log
  const changes = {};
  const fields = ["name", "link", "quantity", "notes", "date", "status", "category", "unit_cost", "requested_by", "department"];
  const newVals = { name, link, quantity: quantity || 1, notes, date, status: effectiveStatus, category: category || null, unit_cost: unit_cost != null ? unit_cost : null, requested_by: requested_by || null, department: department || null };
  for (const f of fields) {
    if (String(oldOrder[f] ?? "") !== String(newVals[f] ?? "")) {
      changes[f] = { old: oldOrder[f], new: newVals[f] };
    }
  }
  if (Object.keys(changes).length > 0) {
    logAudit(req.user.id, req.user.username, "update", "order", req.params.id, changes);
    notifyOrderChange(req.user.id, req.user.username, "updated", { name, id: req.params.id });
  }

  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  res.json({ ...updated, email_sent: !!updated.email_sent, email_replied: !!updated.email_replied, followup: !!updated.followup, delivered: !!updated.delivered });
});

app.delete("/api/orders/:id", authenticate, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM orders WHERE id = ?").run(req.params.id);
  logAudit(req.user.id, req.user.username, "delete", "order", req.params.id, { name: order?.name });
  if (order) notifyOrderChange(req.user.id, req.user.username, "deleted", order);
  res.json({ success: true });
});

// ── Image Cache ──

app.patch("/api/orders/:id/image", authenticate, (req, res) => {
  const { image_url } = req.body;
  if (!image_url || typeof image_url !== "string") {
    return res.status(400).json({ error: "image_url required" });
  }
  try { new URL(image_url); } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  db.prepare("UPDATE orders SET image_url = ? WHERE id = ?").run(image_url, req.params.id);
  res.json({ success: true });
});

app.post("/api/orders/refresh-images", authenticate, requireAdmin, async (req, res) => {
  const orders = db.prepare("SELECT id, link FROM orders WHERE image_url IS NULL AND link IS NOT NULL AND link != ''").all();
  let updated = 0;

  for (const order of orders) {
    try {
      const result = await new Promise((resolve) => {
        let parsed;
        try { parsed = new URL(order.link); } catch { return resolve(null); }
        const isAmazon = parsed.hostname.includes("amazon.");
        const target = isAmazon ? cleanAmazonUrl(order.link) : order.link;
        const client = target.startsWith("https") ? https : http;

        const request = client.get(target, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "identity",
          },
          timeout: 5000,
        }, (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            return resolve(null); // skip redirects for bulk refresh
          }
          let data = "";
          response.on("data", chunk => data += chunk);
          response.on("end", () => {
            // Cloudflare detection
            if (data.includes("Just a moment") || data.includes("challenge-platform") || response.headers["cf-mitigated"] === "challenge") {
              return resolve(null);
            }
            let match = data.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
            if (!match) match = data.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
            if (!match) match = data.match(/"hiRes"\s*:\s*"(https?:\/\/[^"]+)"/);
            if (!match) match = data.match(/"large"\s*:\s*"(https?:\/\/[^"]+)"/);
            if (!match) match = data.match(/"mainUrl"\s*:\s*"(https?:\/\/[^"]+)"/);
            if (!match) match = data.match(/id="landingImage"[^>]*src="([^"]+)"/);
            if (!match) match = data.match(/data-old-hires="(https?:\/\/[^"]+)"/);
            if (!match && isAmazon) {
              const asin = extractAsin(order.link);
              if (asin) match = [null, `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX300_.jpg`];
            }
            if (!match) match = data.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
            resolve(match ? match[1] : null);
          });
        });
        request.on("error", () => resolve(null));
        request.on("timeout", () => { request.destroy(); resolve(null); });
      });

      if (result) {
        db.prepare("UPDATE orders SET image_url = ? WHERE id = ?").run(result, order.id);
        updated++;
      }
    } catch { /* skip failures */ }
  }

  res.json({ success: true, total: orders.length, updated });
});

// ── CSV Export ──

app.get("/api/orders/export", authenticate, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();

  function csvEscape(val) {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  const headers = ["ID", "Name", "Link", "Quantity", "Unit Cost", "Total Cost", "Notes", "Category", "Department", "Requested By", "Date", "Last Updated", "Email Sent", "Replied", "Follow-up", "Delivered", "Created By", "Created At"];
  const rows = orders.map(o => [
    o.id, o.name, o.link, o.quantity, o.unit_cost, o.unit_cost != null ? (o.unit_cost * (o.quantity || 1)).toFixed(2) : "",
    o.notes, o.category, o.department, o.requested_by, o.date, o.last_updated,
    o.email_sent ? "Yes" : "No", o.email_replied ? "Yes" : "No",
    o.followup ? "Yes" : "No", o.delivered ? "Yes" : "No",
    o.created_by, o.created_at,
  ].map(csvEscape).join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  const dateStr = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="orders-${dateStr}.csv"`);
  res.send(csv);
});

// ── Import Helpers ──

function normalizeDate(val) {
  if (!val && val !== 0) return new Date().toISOString().slice(0, 10);
  // If it's a number (Excel serial date)
  if (typeof val === "number" && val > 1000) {
    const d = new Date((val - 25569) * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // If it's a Date object
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) return val.toISOString().slice(0, 10);
  }
  // Try parsing as string
  const str = String(val).trim();
  if (!str) return new Date().toISOString().slice(0, 10);
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function parseBool(val) {
  if (val === true || val === 1) return 1;
  if (typeof val === "string") {
    const lower = val.trim().toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1") return 1;
  }
  return 0;
}

function extractHyperlinks(ws) {
  const hyperlinks = {};
  // Check ws['!hyperlinks'] array (xlsx format)
  if (ws["!hyperlinks"]) {
    for (const hl of ws["!hyperlinks"]) {
      hyperlinks[hl.ref] = hl.Target;
    }
  }
  // Also check individual cell .l properties
  for (const ref in ws) {
    if (ref[0] === "!") continue;
    if (ws[ref] && ws[ref].l && ws[ref].l.Target) {
      hyperlinks[ref] = ws[ref].l.Target;
    }
  }
  return hyperlinks;
}

function buildHyperlinksByRow(ws, hyperlinks, columns) {
  // Map column headers to column indices
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const headerRow = range.s.r;
  const colIndexMap = {}; // colHeader -> colIndex
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: headerRow, c });
    const cell = ws[cellRef];
    if (cell && cell.v != null) {
      colIndexMap[String(cell.v)] = c;
    }
  }

  // Build row-indexed hyperlink map
  const byRow = {};
  for (const [ref, url] of Object.entries(hyperlinks)) {
    const decoded = XLSX.utils.decode_cell(ref);
    const rowIdx = decoded.r - headerRow - 1; // 0-based data row index
    if (rowIdx < 0) continue;
    // Find which column header this belongs to
    for (const [header, colIdx] of Object.entries(colIndexMap)) {
      if (colIdx === decoded.c) {
        if (!byRow[rowIdx]) byRow[rowIdx] = {};
        byRow[rowIdx][header] = url;
        break;
      }
    }
  }
  return byRow;
}

// ── Bulk Import ──

app.post("/api/orders/import", authenticate, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });

    if (data.length === 0) return res.status(400).json({ error: "File contains no data" });

    // Extract hyperlinks for .xlsx files
    const hyperlinks = extractHyperlinks(ws);
    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    const hyperlinksByRow = buildHyperlinksByRow(ws, hyperlinks, columns);
    const hasHyperlinks = Object.keys(hyperlinks).length > 0;
    // Determine which columns have hyperlinks
    const hyperlinkColumns = [];
    if (hasHyperlinks) {
      const colsWithLinks = new Set();
      for (const rowData of Object.values(hyperlinksByRow)) {
        for (const col of Object.keys(rowData)) colsWithLinks.add(col);
      }
      hyperlinkColumns.push(...colsWithLinks);
    }

    // If preview mode, return column headers and first 5 rows
    if (req.query.preview === "true") {
      return res.json({
        columns,
        preview: data.slice(0, 5),
        totalRows: data.length,
        hasHyperlinks,
        hyperlinkColumns,
      });
    }

    // Get column mapping from body
    let mapping;
    try {
      mapping = JSON.parse(req.body.mapping || "{}");
    } catch {
      return res.status(400).json({ error: "Invalid column mapping" });
    }

    const errors = [];
    let imported = 0;

    const insertOrder = db.prepare(`INSERT INTO orders (id, name, link, quantity, notes, date, last_updated, email_sent, email_replied, followup, delivered, created_by, unit_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    // For duplicate detection
    const findByName = db.prepare("SELECT id FROM orders WHERE name = ? COLLATE NOCASE");
    const duplicates = [];

    const transaction = db.transaction((rows) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = String(row[mapping.name] || "").trim();
        if (!name) {
          // Silently skip completely empty rows
          const hasAnyData = Object.values(row).some(v => String(v || "").trim());
          if (!hasAnyData) continue;
          errors.push({ row: i + 2, error: "Missing item name" });
          continue;
        }

        // Duplicate detection
        const existing = findByName.get(name);
        if (existing) {
          duplicates.push({ row: i + 2, name, existingId: existing.id });
          continue;
        }

        const orderId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + i;
        const now = new Date().toISOString().slice(0, 10);

        // Determine link: explicit mapping > hyperlink from name column > null
        let link = mapping.link ? String(row[mapping.link] || "").trim() || null : null;
        if (!link && hyperlinksByRow[i] && mapping.name) {
          link = hyperlinksByRow[i][mapping.name] || null;
        }

        try {
          insertOrder.run(
            orderId,
            name,
            link,
            mapping.quantity ? parseInt(row[mapping.quantity]) || 1 : 1,
            mapping.notes ? String(row[mapping.notes] || "").trim() || null : null,
            mapping.date ? normalizeDate(row[mapping.date]) : now,
            now,
            parseBool(mapping.email_sent ? row[mapping.email_sent] : 0),
            parseBool(mapping.email_replied ? row[mapping.email_replied] : 0),
            parseBool(mapping.followup ? row[mapping.followup] : 0),
            parseBool(mapping.delivered ? row[mapping.delivered] : 0),
            req.user.username,
            mapping.unit_cost ? parseFloat(row[mapping.unit_cost]) || null : null
          );
          imported++;
        } catch (e) {
          errors.push({ row: i + 2, error: e.message });
        }
      }
    });

    transaction(data);
    logAudit(req.user.id, req.user.username, "import", "order", null, { imported, errors: errors.length, duplicates: duplicates.length });
    res.json({ imported, errors, duplicates, total: data.length });
  } catch (e) {
    res.status(400).json({ error: "Failed to parse file: " + e.message });
  }
});

// ── Bulk Delete ──

app.post("/api/orders/bulk-delete", authenticate, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids array required" });
  }

  const getOrder = db.prepare("SELECT * FROM orders WHERE id = ?");
  const deleteOrder = db.prepare("DELETE FROM orders WHERE id = ?");

  const transaction = db.transaction((orderIds) => {
    let deleted = 0;
    for (const id of orderIds) {
      const order = getOrder.get(id);
      if (order) {
        deleteOrder.run(id);
        logAudit(req.user.id, req.user.username, "delete", "order", id, { name: order.name });
        notifyOrderChange(req.user.id, req.user.username, "deleted", order);
        deleted++;
      }
    }
    return deleted;
  });

  const deleted = transaction(ids);
  res.json({ success: true, deleted });
});

// ── Audit Log API ──

app.get("/api/audit-log", authenticate, requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;

  let where = "";
  const params = [];

  if (req.query.entity_type) {
    where = "WHERE entity_type = ?";
    params.push(req.query.entity_type);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM audit_log ${where}`).get(...params).count;
  const entries = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  res.json({
    entries: entries.map(e => ({ ...e, changes: e.changes ? JSON.parse(e.changes) : null })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

// ── Categories API ──

app.get("/api/categories", authenticate, (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'categories'").get();
  try {
    res.json(JSON.parse(row?.value || "[]"));
  } catch {
    res.json([]);
  }
});

app.put("/api/categories", authenticate, requireAdmin, (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories)) return res.status(400).json({ error: "Categories must be an array" });
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('categories', ?)").run(JSON.stringify(categories));
  res.json({ success: true });
});

// ── Departments API ──

app.get("/api/departments", authenticate, (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'departments'").get();
  try {
    res.json(JSON.parse(row?.value || "[]"));
  } catch {
    res.json([]);
  }
});

app.put("/api/departments", authenticate, requireAdmin, (req, res) => {
  const { departments } = req.body;
  if (!Array.isArray(departments)) return res.status(400).json({ error: "Departments must be an array" });
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('departments', ?)").run(JSON.stringify(departments));
  res.json({ success: true });
});

// ── Dashboard Stats API ──

app.get("/api/dashboard/stats", authenticate, (req, res) => {
  const total = db.prepare("SELECT COUNT(*) as count FROM orders").get().count;
  const active = db.prepare("SELECT COUNT(*) as count FROM orders WHERE delivered = 0").get().count;
  const delivered = db.prepare("SELECT COUNT(*) as count FROM orders WHERE delivered = 1").get().count;

  // Orders by month (last 6 months)
  const byMonth = db.prepare(`
    SELECT strftime('%Y-%m', date) as month, COUNT(*) as count
    FROM orders WHERE date >= date('now', '-6 months')
    GROUP BY month ORDER BY month
  `).all();

  // Average delivery time (days between date and last_updated for delivered orders)
  const avgDelivery = db.prepare(`
    SELECT AVG(julianday(last_updated) - julianday(date)) as avg_days
    FROM orders WHERE delivered = 1 AND last_updated IS NOT NULL
  `).get();

  // By category
  const byCategory = db.prepare(`
    SELECT COALESCE(category, 'Uncategorized') as category, COUNT(*) as count
    FROM orders GROUP BY category ORDER BY count DESC
  `).all();

  // By user
  const byUser = db.prepare(`
    SELECT COALESCE(created_by, 'Unknown') as user, COUNT(*) as count
    FROM orders GROUP BY created_by ORDER BY count DESC
  `).all();

  // Stale count
  const staleDays = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'stale_days'").get()?.value || "5");
  const staleDate = new Date(Date.now() - staleDays * 86400000).toISOString().slice(0, 10);
  const stale = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE delivered = 0 AND COALESCE(last_updated, date) <= ?
  `).get(staleDate).count;

  // Budget stats
  const totalSpent = db.prepare("SELECT SUM(unit_cost * quantity) as total FROM orders WHERE unit_cost IS NOT NULL").get().total || 0;
  const spentByCategory = db.prepare(`
    SELECT COALESCE(category, 'Uncategorized') as category, SUM(unit_cost * quantity) as total
    FROM orders WHERE unit_cost IS NOT NULL GROUP BY category ORDER BY total DESC
  `).all();
  const spentByMonth = db.prepare(`
    SELECT strftime('%Y-%m', date) as month, SUM(unit_cost * quantity) as total
    FROM orders WHERE unit_cost IS NOT NULL AND date >= date('now', '-6 months')
    GROUP BY month ORDER BY month
  `).all();

  // Delivery time trend
  const deliveryTimeTrend = db.prepare(`
    SELECT strftime('%Y-%m', last_updated) as month, AVG(julianday(last_updated) - julianday(date)) as avg_days
    FROM orders WHERE delivered = 1 AND last_updated IS NOT NULL AND last_updated >= date('now', '-6 months')
    GROUP BY month ORDER BY month
  `).all().map(d => ({ ...d, avg_days: Math.round(d.avg_days * 10) / 10 }));

  // Overdue orders
  const overdueOrders = db.prepare(`
    SELECT id, name, date, last_updated FROM orders
    WHERE delivered = 0 AND archived = 0 AND COALESCE(last_updated, date) <= ?
    ORDER BY COALESCE(last_updated, date) ASC LIMIT 10
  `).all(staleDate);

  // Orders by department
  const byDepartment = db.prepare(`
    SELECT COALESCE(department, 'Unassigned') as department, COUNT(*) as count
    FROM orders GROUP BY department ORDER BY count DESC
  `).all();

  // Spending by department
  const spentByDepartment = db.prepare(`
    SELECT COALESCE(department, 'Unassigned') as department,
      ROUND(SUM(unit_cost * quantity), 2) as total
    FROM orders WHERE unit_cost IS NOT NULL
    GROUP BY department ORDER BY total DESC
  `).all();

  // Spending by vendor
  const spentByVendor = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(vendor), ''), 'Unknown') as vendor,
      ROUND(SUM(unit_cost * quantity), 2) as total
    FROM orders WHERE unit_cost IS NOT NULL
    GROUP BY LOWER(TRIM(COALESCE(vendor, ''))) ORDER BY total DESC
  `).all();

  // Orders by requester
  const byRequester = db.prepare(`
    SELECT COALESCE(requested_by, 'Unspecified') as requester, COUNT(*) as count
    FROM orders GROUP BY requested_by ORDER BY count DESC
  `).all();

  // Recurring/repeat orders (items ordered more than once)
  const recurringOrders = db.prepare(`
    SELECT name, COUNT(*) as times_ordered, SUM(quantity) as total_qty,
      ROUND(SUM(CASE WHEN unit_cost IS NOT NULL THEN unit_cost * quantity ELSE 0 END), 2) as total_spent
    FROM orders GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1
    ORDER BY times_ordered DESC LIMIT 15
  `).all();

  // Highest single order cost
  const highestOrderCost = db.prepare(`
    SELECT name, ROUND(unit_cost * quantity, 2) as total_cost
    FROM orders WHERE unit_cost IS NOT NULL
    ORDER BY total_cost DESC LIMIT 1
  `).get();

  res.json({
    total, active, delivered, stale,
    avgDeliveryDays: avgDelivery.avg_days ? Math.round(avgDelivery.avg_days * 10) / 10 : null,
    byMonth, byCategory, byUser,
    totalSpent, spentByCategory, spentByMonth,
    deliveryTimeTrend, overdueOrders,
    byDepartment, spentByDepartment, spentByVendor, byRequester, recurringOrders, highestOrderCost,
  });
});

// Spend report as CSV (one row per order with cost) — for finance / procurement.
app.get("/api/dashboard/spend-report.csv", authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT date, name, COALESCE(vendor,'') as vendor, COALESCE(category,'') as category,
      COALESCE(department,'') as department, COALESCE(requested_by,'') as requested_by,
      quantity, unit_cost, ROUND(unit_cost * quantity, 2) as total_cost, status
    FROM orders WHERE unit_cost IS NOT NULL ORDER BY date DESC
  `).all();
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Date", "Item", "Vendor", "Category", "Department", "Requested By", "Qty", "Unit Cost", "Total Cost", "Status"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.date, r.name, r.vendor, r.category, r.department, r.requested_by, r.quantity, r.unit_cost, r.total_cost, r.status].map(esc).join(","));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="spend-report-${stamp}.csv"`);
  res.send("﻿" + lines.join("\r\n")); // BOM so Excel reads UTF-8 correctly
});

// ── Email Templates API ──

app.get("/api/email-templates", authenticate, (req, res) => {
  const templates = db.prepare("SELECT * FROM email_templates ORDER BY is_default DESC, name ASC").all();
  res.json(templates);
});

app.post("/api/email-templates", authenticate, requireAdmin, (req, res) => {
  const { name, subject, body, category, is_default } = req.body;
  if (!name || !subject || !body) return res.status(400).json({ error: "Name, subject, and body required" });

  if (is_default) {
    // Clear other defaults for this category (or global)
    if (category) {
      db.prepare("UPDATE email_templates SET is_default = 0 WHERE category = ?").run(category);
    } else {
      db.prepare("UPDATE email_templates SET is_default = 0 WHERE category IS NULL").run();
    }
  }

  const result = db.prepare("INSERT INTO email_templates (name, subject, body, category, is_default) VALUES (?, ?, ?, ?, ?)")
    .run(name, subject, body, category || null, is_default ? 1 : 0);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put("/api/email-templates/:id", authenticate, requireAdmin, (req, res) => {
  const { name, subject, body, category, is_default } = req.body;

  if (is_default) {
    if (category) {
      db.prepare("UPDATE email_templates SET is_default = 0 WHERE category = ?").run(category);
    } else {
      db.prepare("UPDATE email_templates SET is_default = 0 WHERE category IS NULL").run();
    }
  }

  db.prepare("UPDATE email_templates SET name=?, subject=?, body=?, category=?, is_default=? WHERE id=?")
    .run(name, subject, body, category || null, is_default ? 1 : 0, req.params.id);
  res.json({ success: true });
});

app.delete("/api/email-templates/:id", authenticate, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM email_templates WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ── Notifications API ──

app.get("/api/notifications", authenticate, (req, res) => {
  const notifications = db.prepare(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(req.user.id);
  const unread = db.prepare(
    "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0"
  ).get(req.user.id).count;
  res.json({ notifications, unread });
});

app.post("/api/notifications/read", authenticate, (req, res) => {
  const { ids } = req.body;
  if (ids && Array.isArray(ids)) {
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE id IN (${placeholders}) AND user_id = ?`)
      .run(...ids, req.user.id);
  } else {
    db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user.id);
  }
  res.json({ success: true });
});

app.delete("/api/notifications/:id", authenticate, (req, res) => {
  db.prepare("DELETE FROM notifications WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ── Attachments API ──

app.get("/api/orders/:id/attachments", authenticate, (req, res) => {
  const attachments = db.prepare(
    "SELECT id, order_id, filename, mime_type, size, uploaded_by, created_at FROM attachments WHERE order_id = ?"
  ).all(req.params.id);
  res.json(attachments);
});

app.post("/api/orders/:id/attachments", authenticate, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  if (!VALID_ORDER_ID.test(req.params.id)) return res.status(400).json({ error: "Invalid order ID" });

  const order = db.prepare("SELECT id FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const result = db.prepare(
    "INSERT INTO attachments (order_id, filename, mime_type, size, data, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(req.params.id, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer, req.user.username);

  res.json({ success: true, id: result.lastInsertRowid, filename: req.file.originalname, size: req.file.size });
});

app.get("/api/attachments/:id", authenticate, (req, res) => {
  const attachment = db.prepare("SELECT * FROM attachments WHERE id = ?").get(req.params.id);
  if (!attachment) return res.status(404).json({ error: "Attachment not found" });

  res.setHeader("Content-Type", attachment.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${attachment.filename}"`);
  res.send(attachment.data);
});

app.delete("/api/attachments/:id", authenticate, (req, res) => {
  const attachment = db.prepare("SELECT * FROM attachments WHERE id = ?").get(req.params.id);
  if (!attachment) return res.status(404).json({ error: "Attachment not found" });
  db.prepare("DELETE FROM attachments WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ── Settings API ──

app.get("/api/settings", authenticate, (req, res) => {
  const rows = db.prepare("SELECT * FROM settings").all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

app.put("/api/settings", authenticate, requireAdmin, (req, res) => {
  const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  const transaction = db.transaction((entries) => {
    for (const [key, value] of entries) {
      upsert.run(key, String(value));
    }
  });
  transaction(Object.entries(req.body));
  logAudit(req.user.id, req.user.username, "update", "settings", null, req.body);
  res.json({ success: true });
});

app.post("/api/settings/test-email", authenticate, requireAdmin, async (req, res) => {
  const transporter = getSmtpTransporter();
  if (!transporter) return res.status(400).json({ error: "SMTP not configured. Set SMTP host first." });
  const from = getSmtpFrom();
  const to = getNotificationEmail();
  if (!to) return res.status(400).json({ error: "No notification email address configured." });
  try {
    await transporter.sendMail({
      from: from || '"IT Order Tracker" <noreply@localhost>',
      to,
      subject: "IT Order Tracker - Test Email",
      html: `<div style="font-family: sans-serif; padding: 20px;"><h2>Test Email</h2><p>SMTP is configured correctly.</p><p style="color: #94a3b8; font-size: 11px; margin-top: 20px;">Sent at ${new Date().toISOString()}</p></div>`,
    });
    res.json({ success: true, message: "Test email sent successfully." });
  } catch (err) {
    res.status(500).json({ error: `Failed to send: ${err.message}` });
  }
});

app.post("/api/settings/run-followup-check", authenticate, requireAdmin, (req, res) => {
  runFollowupCheck();
  res.json({ success: true, message: "Follow-up check triggered." });
});

// ── Comments API ──

app.get("/api/orders/:id/comments", authenticate, (req, res) => {
  const comments = db.prepare("SELECT * FROM comments WHERE order_id = ? ORDER BY created_at ASC").all(req.params.id);
  res.json(comments);
});

app.post("/api/orders/:id/comments", authenticate, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Comment text required" });

  const order = db.prepare("SELECT id, name FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const result = db.prepare("INSERT INTO comments (order_id, user_id, username, text) VALUES (?, ?, ?, ?)")
    .run(req.params.id, req.user.id, req.user.username, text.trim());

  logAudit(req.user.id, req.user.username, "comment", "order", req.params.id, { text: text.trim().slice(0, 100) });
  notifyOrderChange(req.user.id, req.user.username, "commented on", order);

  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(result.lastInsertRowid);
  res.json(comment);
});

app.delete("/api/comments/:id", authenticate, (req, res) => {
  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
  if (!comment) return res.status(404).json({ error: "Comment not found" });
  if (comment.user_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "Can only delete your own comments" });
  }
  db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ── Activity Timeline API ──

app.get("/api/orders/:id/activity", authenticate, (req, res) => {
  const comments = db.prepare("SELECT * FROM comments WHERE order_id = ? ORDER BY created_at ASC").all(req.params.id);
  const auditEntries = db.prepare(
    "SELECT * FROM audit_log WHERE entity_type = 'order' AND entity_id = ? ORDER BY timestamp ASC"
  ).all(req.params.id);

  const timeline = [
    ...comments.map(c => ({ type: "comment", id: `c-${c.id}`, commentId: c.id, username: c.username, userId: c.user_id, text: c.text, timestamp: c.created_at })),
    ...auditEntries.map(a => ({ type: "audit", id: `a-${a.id}`, username: a.username, action: a.action, changes: a.changes ? JSON.parse(a.changes) : null, timestamp: a.timestamp })),
  ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  res.json(timeline);
});

// ── Bulk Move ──

app.post("/api/orders/bulk-move", authenticate, (req, res) => {
  const { ids, targetStageIndex } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required" });
  if (targetStageIndex == null || targetStageIndex < 0 || targetStageIndex >= STAGE_KEYS.length) {
    return res.status(400).json({ error: "Invalid target stage index" });
  }

  const targetStatus = STAGE_KEYS[targetStageIndex];
  const getOrder = db.prepare("SELECT * FROM orders WHERE id = ?");
  const updateOrder = db.prepare("UPDATE orders SET status=?, email_sent=?, email_replied=?, followup=?, delivered=?, last_updated=? WHERE id=?");

  const now = new Date().toISOString().slice(0, 10);
  const transaction = db.transaction((orderIds) => {
    let moved = 0;
    for (const id of orderIds) {
      const order = getOrder.get(id);
      if (!order) continue;
      const bools = statusToBooleans(targetStatus);
      updateOrder.run(targetStatus, bools.email_sent, bools.email_replied, bools.followup, bools.delivered, now, id);
      logAudit(req.user.id, req.user.username, "update", "order", id, { bulk_move: targetStageIndex });
      moved++;
    }
    return moved;
  });

  const moved = transaction(ids);
  res.json({ success: true, moved });
});

// ── Bulk Set Category ──

app.post("/api/orders/bulk-set-category", authenticate, (req, res) => {
  const { ids, category } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required" });
  const now = new Date().toISOString().slice(0, 10);
  const update = db.prepare("UPDATE orders SET category = ?, last_updated = ? WHERE id = ?");
  const transaction = db.transaction((orderIds) => {
    let updated = 0;
    for (const id of orderIds) {
      update.run(category || null, now, id);
      logAudit(req.user.id, req.user.username, "update", "order", id, { category: { new: category || null } });
      updated++;
    }
    return updated;
  });
  const updated = transaction(ids);
  res.json({ success: true, updated });
});

app.post("/api/orders/bulk-set-department", authenticate, (req, res) => {
  const { ids, department } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required" });
  const now = new Date().toISOString().slice(0, 10);
  const update = db.prepare("UPDATE orders SET department = ?, last_updated = ? WHERE id = ?");
  const transaction = db.transaction((orderIds) => {
    let updated = 0;
    for (const id of orderIds) {
      update.run(department || null, now, id);
      logAudit(req.user.id, req.user.username, "update", "order", id, { department: { new: department || null } });
      updated++;
    }
    return updated;
  });
  const updated = transaction(ids);
  res.json({ success: true, updated });
});

// ── Order Items (Bulk Orders) ──

app.get("/api/orders/:id/items", authenticate, (req, res) => {
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC").all(req.params.id);
  res.json(items);
});

app.post("/api/orders/:id/items", authenticate, (req, res) => {
  const order = db.prepare("SELECT id FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const { name, link, image_url, quantity, unit_cost, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Item name required" });
  const result = db.prepare(
    "INSERT INTO order_items (order_id, name, link, image_url, quantity, unit_cost, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'sent_to_purchaser')"
  ).run(req.params.id, name.trim(), link || null, image_url || null, quantity || 1, unit_cost != null ? unit_cost : null, notes || null);
  // Mark parent as bulk
  db.prepare("UPDATE orders SET is_bulk = 1 WHERE id = ?").run(req.params.id);
  recomputeBulkParentStatus(req.params.id);
  const item = db.prepare("SELECT * FROM order_items WHERE id = ?").get(result.lastInsertRowid);
  res.json(item);
});

app.put("/api/orders/items/:itemId", authenticate, (req, res) => {
  const item = db.prepare("SELECT * FROM order_items WHERE id = ?").get(req.params.itemId);
  if (!item) return res.status(404).json({ error: "Item not found" });
  const { name, link, image_url, quantity, unit_cost, notes, status } = req.body;
  db.prepare("UPDATE order_items SET name=?, link=?, image_url=?, quantity=?, unit_cost=?, notes=?, status=? WHERE id=?")
    .run(name || item.name, link || null, image_url || null, quantity || 1,
      unit_cost != null ? unit_cost : null, notes || null, status || item.status, req.params.itemId);
  recomputeBulkParentStatus(item.order_id); // keep the parent's rolled-up status in sync
  const updated = db.prepare("SELECT * FROM order_items WHERE id = ?").get(req.params.itemId);
  res.json(updated);
});

app.delete("/api/orders/items/:itemId", authenticate, (req, res) => {
  const item = db.prepare("SELECT * FROM order_items WHERE id = ?").get(req.params.itemId);
  if (!item) return res.status(404).json({ error: "Item not found" });
  db.prepare("DELETE FROM order_items WHERE id = ?").run(req.params.itemId);
  // If no items left, un-mark as bulk; otherwise re-roll the parent status from the remaining items
  const remaining = db.prepare("SELECT COUNT(*) as c FROM order_items WHERE order_id = ?").get(item.order_id).c;
  if (remaining === 0) db.prepare("UPDATE orders SET is_bulk = 0 WHERE id = ?").run(item.order_id);
  else recomputeBulkParentStatus(item.order_id);
  res.json({ success: true });
});

// ── Archive/Unarchive ──

app.post("/api/orders/:id/archive", authenticate, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  db.prepare("UPDATE orders SET archived = 1 WHERE id = ?").run(req.params.id);
  logAudit(req.user.id, req.user.username, "archive", "order", req.params.id, { name: order.name });
  res.json({ success: true });
});

app.post("/api/orders/:id/unarchive", authenticate, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  db.prepare("UPDATE orders SET archived = 0 WHERE id = ?").run(req.params.id);
  logAudit(req.user.id, req.user.username, "unarchive", "order", req.params.id, { name: order.name });
  res.json({ success: true });
});

app.post("/api/orders/bulk-archive", authenticate, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required" });
  const update = db.prepare("UPDATE orders SET archived = 1 WHERE id = ?");
  const transaction = db.transaction((orderIds) => {
    let archived = 0;
    for (const id of orderIds) {
      update.run(id);
      logAudit(req.user.id, req.user.username, "archive", "order", id, {});
      archived++;
    }
    return archived;
  });
  const archived = transaction(ids);
  res.json({ success: true, archived });
});

// ── Health Check ──

app.get("/api/health", (req, res) => {
  let dbOk = false;
  try {
    db.prepare("SELECT 1").get();
    dbOk = true;
  } catch {}
  res.json({ status: dbOk ? "ok" : "degraded", uptime: process.uptime(), dbOk });
});

// ── Link Preview API ──

function cleanAmazonUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!u.hostname.includes("amazon.")) return rawUrl;
    const asinMatch = u.pathname.match(/\/(?:dp|gp\/product|product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
    if (asinMatch) {
      return `${u.protocol}//${u.hostname}/dp/${asinMatch[1]}`;
    }
    return new URL(u.pathname, `${u.protocol}//${u.hostname}`).toString();
  } catch {
    return rawUrl;
  }
}

function extractAsin(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("amazon.")) return null;
    const match = u.pathname.match(/\/(?:dp|gp\/product|product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Nicely-cased vendor name from a hostname slug (e.g. "shi" → "SHI", "cdw" → "CDW", "bestbuy" → "Best Buy")
const VENDOR_NAMES = { shi: "SHI", cdw: "CDW", bestbuy: "Best Buy", newegg: "Newegg", walmart: "Walmart", dell: "Dell", staples: "Staples", insight: "Insight", connection: "Connection", ebay: "eBay", bhphotovideo: "B&H" };
function vendorFromHost(host) {
  if (!host) return null;
  return VENDOR_NAMES[host.toLowerCase()] || (host.charAt(0).toUpperCase() + host.slice(1));
}

// ── Headless-browser fallback (for sites that block plain HTTP, e.g. Amazon price) ──
// A real Chromium renders the page so JS-gated content (price) becomes readable. The browser
// is launched lazily and reused across requests; it auto-closes after a period of inactivity.
let _browser = null;
let _browserIdleTimer = null;
async function getBrowser() {
  const puppeteer = require("puppeteer");
  if (_browser && _browser.connected) return _browser;
  _browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
  });
  return _browser;
}
function scheduleBrowserClose() {
  clearTimeout(_browserIdleTimer);
  _browserIdleTimer = setTimeout(async () => {
    const b = _browser; _browser = null;
    if (b) { try { await b.close(); } catch {} }
  }, 5 * 60 * 1000); // close 5 min after last use
}

async function renderProductWithBrowser(url) {
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 900 });
    // Block heavy resources we don't need — we read image URLs from the DOM, not the pixels.
    await page.setRequestInterception(true);
    page.on("request", req => {
      const t = req.resourceType();
      if (t === "image" || t === "media" || t === "font" || t === "stylesheet") req.abort();
      else req.continue();
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    // Give Amazon's price element a moment to populate; ignore timeout if it never appears.
    await page.waitForSelector(".a-price .a-offscreen, #corePrice_feature_div .a-offscreen, #priceblock_ourprice, [data-testid='price-value']", { timeout: 6000 }).catch(() => {});

    const result = await page.evaluate(() => {
      const txt = (sel) => { const el = document.querySelector(sel); return el ? (el.textContent || el.content || "").trim() : null; };
      const attr = (sel, a) => { const el = document.querySelector(sel); return el ? el.getAttribute(a) : null; };
      // Price — try the most specific Amazon selectors first, then generic ones.
      const priceSelectors = [
        "#corePrice_feature_div .a-offscreen", "#corePriceDisplay_desktop_feature_div .a-offscreen",
        ".a-price .a-offscreen", "#priceblock_ourprice", "#priceblock_dealprice",
        "[itemprop='price']", "[data-testid='price-value']", "meta[property='og:price:amount']",
      ];
      let priceText = null;
      for (const s of priceSelectors) { const v = txt(s) || attr(s, "content"); if (v) { priceText = v; break; } }
      const title = txt("#productTitle") || txt("meta[property='og:title']") || attr("meta[property='og:title']", "content") || document.title;
      const image = attr("#landingImage", "src") || attr("#imgBlkFront", "src") || attr("meta[property='og:image']", "content");
      return { priceText, title, image };
    });

    let price = null;
    if (result.priceText) {
      const raw = parseFloat(String(result.priceText).replace(/[^0-9.]/g, ""));
      if (!isNaN(raw) && raw > 0 && raw < 100000) price = raw;
    }
    return { price, title: result.title || null, image: result.image || null };
  } catch {
    return null;
  } finally {
    if (page) { try { await page.close(); } catch {} }
    scheduleBrowserClose();
  }
}

app.get("/api/preview", authenticate, (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: "URL required" });

  // SSRF protection: validate URL scheme and block private IPs
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return res.status(400).json({ error: "Only HTTP/HTTPS URLs are allowed" });
  }

  const isAmazon = parsed.hostname.includes("amazon.");

  // Resolve hostname and check for private IPs
  dns.resolve4(parsed.hostname, (err, addresses) => {
    if (err) {
      // If DNS resolution fails, try to check if hostname is an IP directly
      if (net.isIP(parsed.hostname)) {
        if (isPrivateIP(parsed.hostname)) {
          return res.status(400).json({ error: "Private/internal URLs are not allowed" });
        }
      } else {
        return res.json({ image: null, title: null });
      }
    } else if (addresses.some(isPrivateIP)) {
      return res.status(400).json({ error: "Private/internal URLs are not allowed" });
    }

    let responded = false;
    const rawSend = (result) => {
      if (responded) return;
      responded = true;
      res.json(result);
    };
    // When the cheap HTTP fetch couldn't get a price (Amazon's bot page, or a blocked site),
    // fall back to rendering the page in a real headless browser before responding.
    const sendResult = (result) => {
      if (responded) return;
      const needsRender = result && result.price == null && (isAmazon || result.blocked);
      if (!needsRender) return rawSend(result);
      renderProductWithBrowser(rawUrl).then(rendered => {
        if (rendered) {
          if (rendered.price != null) { result.price = rendered.price; result.blocked = false; }
          if (!result.image && rendered.image) result.image = rendered.image;
          if (!result.title && rendered.title) result.title = rendered.title;
        }
        rawSend(result);
      }).catch(() => rawSend(result));
    };

    const fetchUrl = (targetUrl, redirectCount = 0) => {
      if (redirectCount > 5) return sendResult({ image: null, title: null });

      const client = targetUrl.startsWith("https") ? https : http;
      const request = client.get(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "identity",
        },
        timeout: 5000,
      }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return fetchUrl(response.headers.location, redirectCount + 1);
        }

        let data = "";
        response.on("data", chunk => data += chunk);
        response.on("end", () => {
          try {
            // Derive what we can from the URL alone (works even when the page is blocked).
            const urlOnlyResult = (blocked) => {
              let title = null;
              const dpMatch = parsed.pathname.match(/^\/([^/]{5,})\/dp\//); // Amazon style
              let slug = dpMatch ? dpMatch[1] : null;
              if (!slug) {
                const segs = parsed.pathname.split("/").filter(s =>
                  s.length >= 8 && (s.match(/-/g) || []).length >= 2 &&
                  !/^\d+$/.test(s.replace(/-/g, "")) && !/\.(html?|aspx?|php)$/i.test(s));
                if (segs.length) slug = segs.sort((a, b) => b.length - a.length)[0];
              }
              if (slug && !/^[A-Z0-9]{10}$/.test(slug)) title = decodeURIComponent(slug).replace(/-/g, " ").trim();

              let image = null;
              if (isAmazon) {
                const asin = extractAsin(rawUrl);
                if (asin) image = `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX300_.jpg`;
              }

              const host = parsed.hostname.replace(/^www\./, "").split(".")[0];
              const vendor = isAmazon ? "Amazon" : vendorFromHost(host);
              return { image, title, price: null, vendor, blocked: !!blocked };
            };

            // Cloudflare / bot-challenge detection — page HTML is unusable, but still return
            // whatever we can infer from the URL, plus a flag so the UI can prompt for manual entry.
            if (data.includes("Just a moment") || data.includes("challenge-platform") || response.statusCode === 403 || response.headers["cf-mitigated"] === "challenge") {
              return sendResult(urlOnlyResult(true));
            }

            // JSON-LD Product schema — most retail sites (Walmart, SHI, CDW, Best Buy, ...)
            // embed this for search engines; it's far more reliable than HTML scraping.
            let ld = {};
            const ldBlocks = data.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
            const findProduct = (node) => {
              if (!node || typeof node !== "object") return null;
              if (Array.isArray(node)) { for (const n of node) { const p = findProduct(n); if (p) return p; } return null; }
              const type = node["@type"];
              if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return node;
              if (node["@graph"]) return findProduct(node["@graph"]);
              return null;
            };
            for (const block of ldBlocks) {
              try {
                const json = JSON.parse(block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, ""));
                const product = findProduct(json);
                if (product) {
                  if (product.name && typeof product.name === "string") ld.title = product.name.trim();
                  const brand = product.brand;
                  if (brand) ld.vendor = typeof brand === "string" ? brand : brand.name || null;
                  let img = product.image;
                  if (Array.isArray(img)) img = img[0];
                  if (img && typeof img === "object") img = img.url || img.contentUrl || null;
                  if (typeof img === "string" && /^https?:\/\//.test(img)) ld.image = img;
                  let offers = product.offers;
                  if (Array.isArray(offers)) offers = offers[0];
                  if (offers) {
                    const p = parseFloat(offers.price ?? offers.lowPrice ?? (offers.priceSpecification && offers.priceSpecification.price));
                    if (!isNaN(p) && p > 0 && p < 100000) ld.price = p;
                  }
                  break;
                }
              } catch { /* malformed JSON-LD block — try the next one */ }
            }

            // Try og:image first
            let match = data.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
            if (!match) match = data.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

            // Amazon-specific patterns (ordered by reliability)
            if (!match) match = data.match(/"hiRes"\s*:\s*"(https?:\/\/[^"]+)"/);
            if (!match) match = data.match(/"large"\s*:\s*"(https?:\/\/[^"]+)"/);
            if (!match) match = data.match(/"mainUrl"\s*:\s*"(https?:\/\/[^"]+)"/);
            if (!match) match = data.match(/id="landingImage"[^>]*src="([^"]+)"/);
            if (!match) match = data.match(/id="imgBlkFront"[^>]*src="([^"]+)"/);
            if (!match) match = data.match(/data-old-hires="(https?:\/\/[^"]+)"/);
            if (!match) match = data.match(/id="imgTagWrapperId"[^>]*>\s*<img[^>]*src="([^"]+)"/);
            if (!match) match = data.match(/"imageUrl"\s*:\s*"(https?:\/\/[^"]+)"/);

            // Amazon ASIN-based image fallback
            if (!match && isAmazon) {
              const asin = extractAsin(rawUrl);
              if (asin) {
                match = [null, `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX300_.jpg`];
              }
            }

            // Try twitter card image, then generic embedded-JSON thumbnail
            if (!match) match = data.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
            if (!match) match = data.match(/"thumbnailUrl"\s*:\s*"(https?:\/\/[^"]+)"/);

            const decodeEntities = (s) => s
              .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
              .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
              .replace(/\s+/g, " ").trim();

            // Get title — prefer JSON-LD, then the actual product title over the page <title>
            let title = ld.title || null;
            // Amazon product title element
            let tMatch = title ? null : data.match(/id="productTitle"[^>]*>([\s\S]*?)<\/span>/i);
            if (tMatch) title = decodeEntities(tMatch[1].replace(/<[^>]*>/g, ""));
            // og:title meta
            if (!title) {
              tMatch = data.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
                || data.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
              if (tMatch) title = decodeEntities(tMatch[1]);
            }
            // <title> tag fallback
            if (!title) {
              tMatch = data.match(/<title[^>]*>([^<]+)<\/title>/i);
              if (tMatch) title = decodeEntities(tMatch[1]);
            }
            if (title) {
              // Strip Amazon boilerplate: "Amazon.com: Product Name" / "Product Name - Amazon.com" / trailing " : Category : ..." parts
              title = title.replace(/^Amazon\.com\s*[:\-–]\s*/i, "").replace(/\s*[:\-–]\s*Amazon\.com.*$/i, "").trim();
              if (isAmazon && title.includes(" : ")) title = title.split(" : ")[0].trim();
              // Strip trailing site-name suffixes like " | SHI" / " - Walmart.com" (only when not from JSON-LD)
              if (!ld.title) title = title.replace(/\s*[|\-–]\s*(Walmart\.com|SHI(\.com)?|CDW(\.com)?|Best Buy|Newegg(\.com)?|eBay)\s*$/i, "").trim();
              // Reject useless generic titles so the form doesn't autofill garbage
              if (/^(amazon\.com|walmart\.com|shi)$/i.test(title) || /^robot (check|or human)/i.test(title) || /^access denied$/i.test(title) || title.length < 3) title = null;
            }

            // Many retail sites (Amazon, SHI, Walmart, CDW) block scrapers — fall back to the
            // product name embedded in the URL slug, e.g. /Logitech-MK270-Wireless-Combo
            if (!title) {
              let slug = null;
              const dpMatch = parsed.pathname.match(/^\/([^/]{5,})\/dp\//); // Amazon style
              if (dpMatch) slug = dpMatch[1];
              if (!slug) {
                // Pick the most word-like hyphenated path segment
                const segs = parsed.pathname.split("/").filter(s =>
                  s.length >= 8 && (s.match(/-/g) || []).length >= 2 &&
                  !/^\d+$/.test(s.replace(/-/g, "")) && !/\.(html?|aspx?|php)$/i.test(s));
                if (segs.length) slug = segs.sort((a, b) => b.length - a.length)[0];
              }
              if (slug && !/^[A-Z0-9]{10}$/.test(slug)) {
                title = decodeURIComponent(slug).replace(/-/g, " ").trim();
              }
            }

            // Get vendor — JSON-LD brand first, then brand on Amazon, og:site_name elsewhere, hostname fallback
            let vendor = ld.vendor || null;
            if (!vendor && isAmazon) {
              let vMatch = data.match(/"brand"\s*:\s*"([^"]{1,60})"/);
              if (!vMatch) vMatch = data.match(/Visit the ([^<]{1,60}?) Store/i);
              if (!vMatch) vMatch = data.match(/id="bylineInfo"[^>]*>\s*(?:Brand:\s*)?([^<]{1,60})</i);
              if (vMatch) vendor = decodeEntities(vMatch[1]).replace(/^Visit the\s+/i, "").replace(/\s+Store$/i, "");
              if (!vendor) vendor = "Amazon";
            } else if (!vendor) {
              // Generic embedded-JSON brand (Walmart, Best Buy, many SPAs)
              let vMatch = data.match(/"brand"\s*:\s*"([^"]{1,60})"/);
              if (!vMatch) vMatch = data.match(/"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]{1,60})"/);
              if (!vMatch) vMatch = data.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
                || data.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
              if (vMatch) vendor = decodeEntities(vMatch[1]);
              if (!vendor) {
                // Derive from hostname: www.cdw.com → CDW
                const host = parsed.hostname.replace(/^www\./, "").split(".")[0];
                if (host) vendor = vendorFromHost(host);
              }
            }

            // Get price
            let price = ld.price || null;
            let priceMatch = price ? null : data.match(/<meta[^>]*property=["']og:price:amount["'][^>]*content=["']([^"']+)["']/i);
            if (!priceMatch) priceMatch = data.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:price:amount["']/i);
            if (!priceMatch && isAmazon) {
              priceMatch = data.match(/"priceAmount"\s*:\s*([\d.]+)/);
              if (!priceMatch) priceMatch = data.match(/"price"\s*:\s*"?([\d.]+)"?/);
              if (!priceMatch) priceMatch = data.match(/class="a-offscreen">\$?([\d,]+\.?\d*)</);
              if (!priceMatch) priceMatch = data.match(/"buyingPrice"\s*:\s*([\d.]+)/);
            }
            if (!priceMatch && !isAmazon) {
              // Generic embedded-JSON price (Walmart "currentPrice", others)
              priceMatch = data.match(/"currentPrice"\s*:\s*\{[^}]*"price"\s*:\s*([\d.]+)/);
              if (!priceMatch) priceMatch = data.match(/itemprop=["']price["'][^>]*content=["']([\d.]+)["']/i);
              if (!priceMatch) priceMatch = data.match(/"price"\s*:\s*"?\$?([\d,]+\.\d{2})"?/);
            }
            if (priceMatch) {
              const raw = parseFloat(String(priceMatch[1]).replace(/,/g, ""));
              if (!isNaN(raw) && raw > 0 && raw < 100000) price = raw;
            }

            sendResult({
              image: (match ? match[1] : null) || ld.image || null,
              title: title,
              price: price,
              vendor: vendor,
            });
          } catch {
            sendResult({ image: null, title: null });
          }
        });
      });
      request.on("error", () => sendResult({ image: null, title: null }));
      request.on("timeout", () => { request.destroy(); sendResult({ image: null, title: null }); });
    };

    fetchUrl(isAmazon ? cleanAmazonUrl(rawUrl) : rawUrl);
  });
});

// ── Recipient Public API (no auth required) ──

app.get("/api/confirm/:token", (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE confirm_token = ?").get(req.params.token);
  if (!order) return res.status(404).json({ error: "Invalid or expired confirmation link" });
  if (!order.confirmed_at) {
    const now = new Date().toISOString();
    // Move to "Ordered" unless the order has already progressed past it
    const orderedIdx = STAGE_KEYS.indexOf("ordered");
    const currentIdx = STAGE_KEYS.indexOf(order.status || "sent_to_purchaser");
    const newStatus = currentIdx >= orderedIdx ? order.status : "ordered";
    const bools = statusToBooleans(newStatus);
    db.prepare("UPDATE orders SET status = ?, email_sent = ?, email_replied = ?, followup = ?, delivered = ?, confirmed_at = ?, last_updated = ? WHERE id = ?")
      .run(newStatus, bools.email_sent, bools.email_replied, bools.followup, bools.delivered, now, now.slice(0, 10), order.id);
    logAudit(null, "recipient", "confirm", "order", order.id, { recipients: order.recipients });
    const users = db.prepare("SELECT id FROM users").all();
    for (const u of users) {
      createNotification(u.id, "order_confirmed", `Order confirmed: ${order.name}`,
        `${order.recipients || "Recipient"} confirmed that "${order.name}" has been ordered.`, "order", order.id);
    }
  }
  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
  res.json({ ...updated, email_sent: !!updated.email_sent, email_replied: !!updated.email_replied, followup: !!updated.followup, delivered: !!updated.delivered, alreadyConfirmed: !!order.confirmed_at });
});

app.get("/api/recipient/:name", (req, res) => {
  const name = decodeURIComponent(req.params.name).trim().toLowerCase();
  // Normalize the stored comma-separated list and match the name as a whole entry, case-insensitively
  const orders = db.prepare(
    "SELECT * FROM orders WHERE archived = 0 AND recipients IS NOT NULL AND (',' || REPLACE(LOWER(recipients), ', ', ',') || ',') LIKE ? ORDER BY created_at DESC"
  ).all(`%,${name},%`);
  res.json(orders.map(o => ({
    ...o,
    email_sent: !!o.email_sent, email_replied: !!o.email_replied,
    followup: !!o.followup, delivered: !!o.delivered,
  })));
});

app.post("/api/recipient/deliver/:orderId", upload.single("photo"), (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const now = new Date().toISOString().slice(0, 10);
  const bools = statusToBooleans("delivered");
  db.prepare("UPDATE orders SET status = 'delivered', email_sent = ?, email_replied = ?, followup = ?, delivered = ?, last_updated = ? WHERE id = ?")
    .run(bools.email_sent, bools.email_replied, bools.followup, bools.delivered, now, order.id);
  logAudit(null, "recipient", "deliver", "order", order.id, { name: order.name, recipients: order.recipients });

  // Optional photo upload — must be an image (rejected otherwise so we don't accept arbitrary files anonymously)
  let photoId = null;
  if (req.file && req.file.mimetype && req.file.mimetype.startsWith("image/")) {
    const filename = req.file.originalname || `delivery-${Date.now()}.jpg`;
    const result = db.prepare(
      "INSERT INTO attachments (order_id, filename, mime_type, size, data, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(order.id, filename, req.file.mimetype, req.file.size, req.file.buffer, order.recipients || "recipient");
    photoId = result.lastInsertRowid;
  }

  const note = req.body?.note;
  if ((note && note.trim()) || photoId) {
    const parts = [];
    if (note && note.trim()) parts.push(note.trim());
    if (photoId) parts.push(`[photo attached: /api/recipient/photo/${photoId}]`);
    const noteText = `Delivery note from ${order.recipients || "recipient"}: ${parts.join(" ")}`;
    db.prepare("INSERT INTO comments (order_id, user_id, username, text) VALUES (?, NULL, ?, ?)")
      .run(order.id, order.recipients || "recipient", noteText);
  }

  // Notify all IT users in-app
  const users = db.prepare("SELECT id FROM users").all();
  for (const u of users) {
    createNotification(u.id, "order_delivered", `Delivered: ${order.name}`,
      `${order.recipients || "Recipient"} marked "${order.name}" as delivered.`, "order", order.id);
  }

  // Send email alert to IT team
  const itEmails = db.prepare("SELECT value FROM settings WHERE key = 'it_alert_emails'").get()?.value || "";
  if (itEmails.trim()) {
    const transporter = getSmtpTransporter();
    if (transporter) {
      const from = getSmtpFrom();
      const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const photoUrl = photoId ? `${proto}://${host}/api/recipient/photo/${photoId}` : null;
      transporter.sendMail({
        from: from || '"IT Order Tracker" <noreply@localhost>',
        to: itEmails,
        subject: `Delivered: ${order.name}`,
        html: `<div style="font-family:sans-serif;max-width:500px;padding:20px">
          <h2 style="color:#22c55e">Order Marked Delivered</h2>
          <p><strong>${order.name}</strong> has been marked as delivered by <strong>${order.recipients || "a recipient"}</strong>.</p>
          ${order.quantity > 1 ? `<p>Quantity: ${order.quantity}</p>` : ""}
          ${note && note.trim() ? `<p style="background:#f1f5f9;border-left:3px solid #22c55e;padding:8px 12px;margin:10px 0;color:#334155"><em>${note.trim().replace(/</g, "&lt;")}</em></p>` : ""}
          ${photoUrl ? `<p><a href="${photoUrl}"><img src="${photoUrl}" alt="Delivery photo" style="max-width:100%;border-radius:8px;border:1px solid #e2e8f0"/></a></p>` : ""}
          ${order.link ? `<p><a href="${order.link}">View Product</a></p>` : ""}
          <p style="color:#94a3b8;font-size:11px">IT Order Tracker</p>
        </div>`,
      }).catch(err => console.error("Failed to send delivery alert:", err.message));
    }
  }

  res.json({ success: true, photoId });
});

// Public delivery-photo viewer — anyone with the id can view (links are emailed to IT and
// only image attachments uploaded via the deliver endpoint are exposed here).
app.get("/api/recipient/photo/:id", (req, res) => {
  const attachment = db.prepare("SELECT mime_type, data FROM attachments WHERE id = ?").get(req.params.id);
  if (!attachment || !attachment.mime_type?.startsWith("image/")) return res.status(404).json({ error: "Not found" });
  res.setHeader("Content-Type", attachment.mime_type);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(attachment.data);
});

// Catch-all: serve the SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`IT Order Tracker running on http://0.0.0.0:${PORT}`);
});
