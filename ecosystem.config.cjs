/** PM2: pm2 startOrReload ecosystem.config.cjs — zelfde patroon als IC-support */
const fs = require("fs");
const path = require("path");

function loadEnvFile(filename) {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = {
  ...loadEnvFile(".env"),
  ...loadEnvFile(".env.production"),
  ...loadEnvFile(".env.local"),
};

module.exports = {
  apps: [
    {
      name: "referentie",
      cwd: "/var/www/referentie",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3023",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        PORT: "3023",
        ...fileEnv,
      },
    },
  ],
};
