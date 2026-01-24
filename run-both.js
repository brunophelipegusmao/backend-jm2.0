#!/usr/bin/env node

const path = require("path");
const { spawn } = require("child_process");

const FRONTEND_PORT = process.env.FRONTEND_PORT ?? "3000";
const BACKEND_PORT = process.env.BACKEND_PORT ?? "3001";
const FRONTEND_URL = process.env.FRONTEND_URL ?? `http://localhost:${FRONTEND_PORT}`;

const backendPath = path.join(__dirname, "backend");
const frontendStandalonePath = path.join(__dirname, "frontend", ".next", "standalone");

process.env.PORT = process.env.PORT ?? BACKEND_PORT;
process.env.FRONTEND_URL = FRONTEND_URL;
process.env.BACKEND_PORT = BACKEND_PORT;

const backend = spawn("node", ["dist/main.js"], {
  cwd: backendPath,
  stdio: "inherit",
  env: { ...process.env, PORT: BACKEND_PORT },
});

const frontend = spawn("node", ["server.js"], {
  cwd: frontendStandalonePath,
  stdio: "inherit",
  env: { ...process.env, PORT: FRONTEND_PORT },
});

let shuttingDown = false;

const cleanup = (signal, code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  backend.kill(signal ?? "SIGTERM");
  frontend.kill(signal ?? "SIGTERM");
  process.exit(code);
};

backend.on("exit", (code, signal) => cleanup(signal ?? "SIGTERM", code ?? 0));
frontend.on("exit", (code, signal) => cleanup(signal ?? "SIGTERM", code ?? 0));

["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.on(sig, () => cleanup(sig));
});
