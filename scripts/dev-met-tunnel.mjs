/**
 * Lokaal ontwikkelen tegen de database en Redis op de VPS.
 * Opent een SSH-tunnel (3307 → MariaDB, 6380 → Redis op de VPS) en start daarna `next dev`.
 * Stopt de tunnel weer als de dev-server stopt. Staat er al een tunnel open, dan wordt die gebruikt.
 *   npm run dev
 * Overrides: VPS_SSH_HOST, SSH_KEY_PATH
 */
import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const HOST = process.env.VPS_SSH_HOST || "root@85.10.144.42";
const KEY = process.env.SSH_KEY_PATH || path.join(os.homedir(), ".ssh", "id_ed25519_homelab");
const FORWARDS = [
  [3307, 3306], // MariaDB
  [6380, 6379], // Redis
];

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}

async function waitFor(port, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await portOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

let tunnel = null;
if (await portOpen(FORWARDS[0][0])) {
  console.log("SSH-tunnel naar de VPS staat al open.");
} else {
  const args = ["-i", KEY, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=30", "-N"];
  for (const [local, remote] of FORWARDS) args.push("-L", `${local}:127.0.0.1:${remote}`);
  args.push(HOST);
  tunnel = spawn("ssh", args, { stdio: "inherit" });
  if (!(await waitFor(FORWARDS[0][0], 15000))) {
    console.error("SSH-tunnel naar de VPS kwam niet op.");
    tunnel.kill();
    process.exit(1);
  }
  console.log("SSH-tunnel naar de VPS open (MariaDB 3307, Redis 6380).");
}

const next = spawn("npx", ["next", "dev", "--hostname", "0.0.0.0", "-p", "3020"], { stdio: "inherit", shell: true });
const stop = () => { if (tunnel && !tunnel.killed) tunnel.kill(); };
next.on("exit", (code) => { stop(); process.exit(code ?? 0); });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { next.kill(sig); stop(); });
