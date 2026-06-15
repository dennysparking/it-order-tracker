import { spawn } from "child_process";

const isWin = process.platform === "win32";
const shell = isWin ? true : false;

const server = spawn("node", ["server/server.js"], {
  stdio: "inherit",
  shell,
  env: { ...process.env, PORT: "3000" },
});

const vite = spawn("npx", ["vite"], {
  stdio: "inherit",
  shell,
});

function cleanup() {
  server.kill();
  vite.kill();
  process.exit();
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

server.on("exit", (code) => {
  if (code !== null) {
    console.error(`Server exited with code ${code}`);
    vite.kill();
    process.exit(code);
  }
});

vite.on("exit", (code) => {
  if (code !== null) {
    server.kill();
    process.exit(code);
  }
});
