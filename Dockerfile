FROM node:24-bullseye-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS backend-builder
WORKDIR /workspace/backend
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY backend .
RUN pnpm run build

FROM base AS frontend-builder
WORKDIR /workspace/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile
COPY frontend .
RUN pnpm run build

FROM node:24-bullseye-slim AS release
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    FRONTEND_URL=http://localhost:3000 \
    FRONTEND_PORT=3000 \
    BACKEND_PORT=3001
COPY --from=frontend-builder /workspace/frontend/.next ./frontend/.next
COPY --from=frontend-builder /workspace/frontend/node_modules ./frontend/node_modules
COPY --from=frontend-builder /workspace/frontend/public ./frontend/public
COPY --from=frontend-builder /workspace/frontend/package.json ./frontend/package.json
COPY --from=backend-builder /workspace/backend/dist ./backend/dist
COPY --from=backend-builder /workspace/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /workspace/backend/package.json ./backend/package.json
COPY backend/run-both.js /app/run-both.js
EXPOSE 3000 3001
CMD ["node", "/app/run-both.js"]
