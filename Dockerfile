# syntax=docker/dockerfile:1.7

# ---------- build-frontend ----------
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN --mount=type=cache,target=/root/.npm \
	cd frontend && npm ci || npm install --no-audit --no-fund
COPY frontend ./frontend
RUN --mount=type=cache,target=/root/.npm \
	cd frontend && npm run build

# ---------- build-backend ----------
FROM node:22-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json* ./backend/
RUN --mount=type=cache,target=/root/.npm \
	cd backend && npm ci --omit=dev || npm install --omit=dev --no-audit --no-fund
COPY backend ./backend

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
	PORT=4000 \
	CORS_ORIGIN=http://localhost:5173 \
	JWT_SECRET=change_me_in_prod \
	UPLOAD_BASE_DIR=/data/uploads \
	DATA_BASE_DIR=/data/appdata \
	LOG_BASE_DIR=/data/logs \
	FRONTEND_DIST_DIR=/app/frontend-dist

# Create runtime dirs
RUN mkdir -p /data/uploads /data/appdata /data/logs ${FRONTEND_DIST_DIR}

# Copy built artifacts
COPY --from=backend /app/backend /app/backend
COPY --from=frontend /app/frontend/dist ${FRONTEND_DIST_DIR}

# Expose port and start server
EXPOSE 4000
WORKDIR /app/backend
CMD ["node", "src/server.js"]