import { execSync } from "child_process";
import { readFileSync } from "fs";
import type { NextConfig } from "next";

/** Versie, commit en builddatum voor de regel onder Instellingen; bepaald bij het bouwen. */
const appVersion = (JSON.parse(readFileSync("./package.json", "utf8")) as { version: string }).version;
let appCommit = "";
try {
  appCommit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
} catch {
  /* geen git (bijv. in een kopie zonder .git) */
}

const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length ? { allowedDevOrigins } : {}),
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_APP_COMMIT: appCommit,
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
  },
  // pdf.js niet bundelen op de server: dan vindt het zijn worker gewoon in node_modules.
  serverExternalPackages: ["pdfjs-dist"],
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
    {
      source: "/manifest.webmanifest",
      headers: [{ key: "Content-Type", value: "application/manifest+json" }],
    },
  ],
};

export default nextConfig;
