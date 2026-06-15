# IT Order Tracker - Portainer Deployment Guide

## Prerequisites

- Docker host with Portainer installed
- Git access to the repository (or the project files copied to the Docker host)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | **Yes** | Random (insecure) | Secret for signing JWT tokens. Generate with: `openssl rand -hex 32` |
| `PORT` | No | `3000` | Server port inside the container |
| `DB_PATH` | No | `/app/data/orders.db` | SQLite database file path |
| `NODE_ENV` | No | `production` | Node environment |

## Deploy via Portainer Stack

1. In Portainer, go to **Stacks > Add stack**
2. Name: `it-order-tracker`
3. Choose **Repository** (if hosted in Git) or **Web editor** (paste docker-compose.yml)
4. If using the web editor, paste the contents of `docker-compose.yml`
5. Under **Environment variables**, add:
   - `JWT_SECRET` = (your generated secret from `openssl rand -hex 32`)
6. Click **Deploy the stack**

## Deploy via Command Line

```bash
# Generate a secure JWT secret
export JWT_SECRET=$(openssl rand -hex 32)

# Build and start
docker compose up -d --build

# Verify it's running
docker compose ps
curl http://localhost:3000/api/health
```

## First-Time Setup

1. Open `http://<your-host>:3000` in a browser
2. You'll be prompted to create the first admin account
3. Configure settings (purchaser email, categories, SMTP if needed)

## Health Check

The container includes a health check at `GET /api/health` that verifies:
- Server is running
- Database is accessible

Portainer will show the container as "healthy" or "unhealthy" based on this check.

## Backup Strategy

The SQLite database is stored in a Docker named volume (`order_data`).

### Option 1: Copy from container

```bash
# One-time backup
docker cp it-order-tracker:/app/data/orders.db ./backup/orders-$(date +%Y%m%d).db

# Automated daily backup (add to crontab)
0 2 * * * docker cp it-order-tracker:/app/data/orders.db /backup/orders-$(date +\%Y\%m\%d).db
```

### Option 2: Host-mounted volume

Change the volume in `docker-compose.yml` to a bind mount for easier backup access:

```yaml
volumes:
  - /path/on/host/data:/app/data
```

Then back up `/path/on/host/data/orders.db` with your existing backup solution.

## Updating

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose up -d --build
```

The database schema auto-migrates on startup. No manual migration steps needed.

## Resource Limits

The default configuration sets:
- **Memory**: 256MB (sufficient for 2-5 users with SQLite)
- **Log rotation**: 10MB max, 3 files

Adjust `mem_limit` in `docker-compose.yml` if needed.
