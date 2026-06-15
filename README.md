# IT Order Tracker

Self-hosted IT order tracking with visual pipeline, Outlook email integration, product image previews, and built-in authentication.

## Features

- **Visual Kanban Pipeline** — Orders flow through Inbox → Email Sent → Replied → Follow-up → Delivered
- **One-Click Email** — Auto-generates Outlook emails via `mailto:` with configurable templates
- **Product Image Previews** — Auto-fetches product images from Amazon and other sites (Open Graph)
- **Quantity Tracking** — Track how many of each item you're ordering
- **Stale Order Alerts** — Red flags for orders stuck in a stage too long (configurable days)
- **Built-in Auth** — JWT-based login with admin/user roles
- **User Management** — Admins can create and manage user accounts
- **List & Pipeline Views** — Switch between Kanban board and spreadsheet-style list
- **SQLite Database** — Lightweight, persistent, zero-config database
- **Docker Ready** — Deploy in seconds via Docker Compose or Portainer

## Quick Start with Docker Compose

```bash
# Clone or copy the project files
cd it-order-app

# Create your .env file
cp .env.example .env
# Edit .env and set a strong JWT_SECRET

# Build and run
docker compose up -d

# App is now at http://localhost:3000
```

## Deploy via Portainer

1. In Portainer, go to **Stacks** → **Add Stack**
2. Choose **Upload** and upload the `docker-compose.yml`, or paste its contents using the **Web editor**
3. Under **Environment variables**, add:
   - `JWT_SECRET` = (generate with `openssl rand -hex 32`)
4. Click **Deploy the stack**
5. Access at `http://your-server:3000`

### Using a Pre-Built Image

If you prefer to build the image separately:

```bash
docker build -t it-order-tracker .
docker run -d \
  --name it-order-tracker \
  --restart unless-stopped \
  -p 3000:3000 \
  -v order_data:/app/data \
  -e JWT_SECRET="your-secret-here" \
  it-order-tracker
```

## First Run

1. Open the app in your browser
2. You'll be prompted to create an **admin account**
3. Log in and go to **⚙ Settings** to configure:
   - **Purchaser Email** — The "To" address for generated emails
   - **Stale Days** — How long before an order is flagged as stale
   - **Email Template** — Customize the subject and body

## Usage

### Creating Orders
1. Click **+ New Order**
2. Paste the product URL — the app auto-fetches the product image and title
3. Adjust the name, quantity, date, and notes
4. Check "Open email in Outlook" to auto-generate the purchase request email
5. Click **Create & Send**

### Tracking Orders
- **Pipeline view**: Cards sit in columns by status. Click a card to expand, then advance or revert.
- **List view**: Familiar spreadsheet layout. Click checkboxes to advance/revert stages.
- **Stale filter**: Click 🔔 Stale in the header to show only stuck orders.

### Email Template Variables
- `{{item_name}}` — Order item name
- `{{quantity}}` — Quantity
- `{{link}}` — Product URL
- `{{notes}}` — Order notes

## Architecture

```
├── server.js          # Express API + auth + SQLite
├── public/
│   └── index.html     # React SPA (single file, no build step)
├── data/
│   └── orders.db      # SQLite database (auto-created)
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Backup

The SQLite database lives in the Docker volume `order_data`. To backup:

```bash
docker cp it-order-tracker:/app/data/orders.db ./backup-orders.db
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | random | Secret for JWT tokens (set this!) |
| `DB_PATH` | `/app/data/orders.db` | Database file path |
