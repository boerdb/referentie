/**
 * Productie-deploy naar NEXT (192.168.1.32) — patroon news-app / med-track.
 *   DEPLOY_PASS=... npm run deploy
 * Optioneel: DEPLOY_HOST, DEPLOY_USER, DEPLOY_DATABASE_URL, DEPLOY_AUTH_SECRET
 */
import { Client } from "ssh2";
import { execSync } from "child_process";

const HOST = process.env.DEPLOY_HOST || "192.168.1.32";
const USER = process.env.DEPLOY_USER || "root";
const PASS = process.env.DEPLOY_PASS;
const APP_DIR = "/var/www/referentie";
const REPO = "git@github.com:boerdb/referentie.git";
const PORT = process.env.APP_PORT || "3023";
const REDIS_URL = process.env.REDIS_URL || "redis://192.168.1.14:6379";

if (!PASS) {
  console.error("Zet DEPLOY_PASS (SSH-wachtwoord voor NEXT-server)");
  process.exit(1);
}

function exec(conn, cmd, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ ${label || cmd.slice(0, 100)}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream
        .on("close", (code) => {
          if (code !== 0) reject(new Error(`Exit ${code}: ${out.slice(-800)}`));
          else resolve(out);
        })
        .on("data", (d) => {
          const s = d.toString();
          out += s;
          process.stdout.write(s);
        })
        .stderr.on("data", (d) => process.stderr.write(d.toString()));
    });
  });
}

function parseEnvValue(text, key) {
  const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m?.[1]?.trim() ?? "";
}

function randomSecret() {
  return execSync('node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"', {
    encoding: "utf8",
  }).trim();
}

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn
      .on("ready", resolve)
      .on("error", reject)
      .connect({ host: HOST, port: 22, username: USER, password: PASS });
  });

  try {
    await exec(conn, "node -v && npm -v && pm2 -v", "Check node/npm/pm2");

    const hasDir = await exec(
      conn,
      `test -d ${APP_DIR}/.git && echo yes || echo no`,
      "Check git repo",
    );

    if (hasDir.includes("yes")) {
      await exec(
        conn,
        `cd ${APP_DIR} && git fetch origin && git reset --hard origin/main && git clean -fd`,
        "Sync origin/main",
      );
    } else {
      await exec(
        conn,
        `mkdir -p /var/www && cd /var/www && git clone ${REPO} referentie`,
        "Git clone",
      );
    }

    let existingEnv = "";
    try {
      existingEnv = await exec(
        conn,
        `cat ${APP_DIR}/.env.local 2>/dev/null || true`,
        "Read .env.local",
      );
    } catch {
      existingEnv = "";
    }

    const dbUrl =
      process.env.DEPLOY_DATABASE_URL ||
      parseEnvValue(existingEnv, "DATABASE_URL") ||
      "mysql://referentie:VUL_AAN@192.168.1.14:3306/referentie";

    const authSecret =
      process.env.DEPLOY_AUTH_SECRET ||
      parseEnvValue(existingEnv, "AUTH_SECRET") ||
      randomSecret();

    const registration =
      parseEnvValue(existingEnv, "REGISTRATION_OPEN") || "true";

    if (dbUrl.includes("VUL_AAN")) {
      console.warn("\n⚠️  DATABASE_URL bevat placeholder — pas .env.local op de server aan!");
    }

    const envContent = `# referentie production — ${new Date().toISOString()}
NODE_ENV=production
PORT=${PORT}
DATABASE_URL=${dbUrl}
REDIS_URL=${REDIS_URL}
AUTH_SECRET=${authSecret}
REGISTRATION_OPEN=${registration}
UPLOAD_DIR=./data/pdfs
`;

    const envB64 = Buffer.from(envContent).toString("base64");
    await exec(
      conn,
      `echo '${envB64}' | base64 -d > ${APP_DIR}/.env.local && chmod 600 ${APP_DIR}/.env.local`,
      "Write .env.local",
    );

    await exec(
      conn,
      `cd ${APP_DIR} && mkdir -p data/pdfs && npm ci && npm run build`,
      "npm ci + build",
    );

    await exec(
      conn,
      `cd ${APP_DIR} && pm2 delete referentie 2>/dev/null; PORT=${PORT} pm2 start npm --name referentie -- start && pm2 save`,
      "PM2 start",
    );

    const health = await exec(
      conn,
      `curl -s -m 5 http://127.0.0.1:${PORT}/api/health/redis || true`,
      "Health redis",
    );
    console.log("\n✅ Deploy klaar");
    console.log(`   http://${HOST}:${PORT}`);
    console.log(`   health: ${health.trim()}`);
  } finally {
    conn.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Deploy mislukt:", err.message);
  process.exit(1);
});
