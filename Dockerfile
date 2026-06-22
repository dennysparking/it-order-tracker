# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build

WORKDIR /build
COPY package.json package-lock.json* ./
# --legacy-peer-deps: @vitejs/plugin-react@4.x declares a stale peer range
# (vite ^4-^7) while the project uses vite 8; the tree builds fine regardless.
RUN npm install --legacy-peer-deps
COPY src/ ./src/
COPY index.html vite.config.js ./
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine

WORKDIR /app

# Install build tools for better-sqlite3 + wget for healthcheck
RUN apk add --no-cache python3 make g++

# Install server dependencies only
COPY server/package.json server/package-lock.json* ./
RUN npm install --production

# Remove build tools to reduce image size
RUN apk del python3 make g++

# Copy server code
COPY server/server.js ./

# Copy built frontend from stage 1
COPY --from=frontend-build /build/dist ./dist/

# Create data directory
RUN mkdir -p /app/data

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV DB_PATH=/app/data/orders.db

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
