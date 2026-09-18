import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "public", "icons");
mkdirSync(dir, { recursive: true });

/** Bibliotheek: boekenplank + open boek — leesbaar op 192px PWA */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="64" y1="48" x2="448" y2="464" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="55%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
    <linearGradient id="shelf" x1="96" y1="352" x2="416" y2="388" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <!-- open book -->
  <path d="M256 88c-52 0-98 28-120 44v168c0 8 6 14 14 14 28-18 66-32 106-32s78 14 106 32c8 0 14-6 14-14V132c-22-16-68-44-120-44z" fill="#ffffff" opacity="0.98"/>
  <path d="M256 88v312" stroke="#0284c7" stroke-width="5" stroke-linecap="round" opacity="0.35"/>
  <path d="M148 148c36-22 72-36 108-36s72 14 108 36" fill="none" stroke="#bae6fd" stroke-width="6" stroke-linecap="round"/>
  <path d="M168 200h72M168 228h56M272 200h72M272 228h56" stroke="#cbd5e1" stroke-width="5" stroke-linecap="round"/>
  <!-- shelf -->
  <rect x="88" y="348" width="336" height="28" rx="10" fill="url(#shelf)"/>
  <rect x="88" y="372" width="336" height="8" rx="4" fill="#94a3b8" opacity="0.45"/>
  <!-- books on shelf -->
  <rect x="108" y="248" width="52" height="100" rx="6" fill="#ffffff"/>
  <rect x="108" y="248" width="14" height="100" rx="4" fill="#fbbf24"/>
  <rect x="172" y="232" width="58" height="116" rx="6" fill="#ffffff"/>
  <rect x="172" y="232" width="14" height="116" rx="4" fill="#34d399"/>
  <rect x="246" y="258" width="48" height="90" rx="6" fill="#ffffff"/>
  <rect x="246" y="258" width="12" height="90" rx="4" fill="#f472b6"/>
  <rect x="308" y="238" width="56" height="110" rx="6" fill="#ffffff"/>
  <rect x="308" y="238" width="14" height="110" rx="4" fill="#a78bfa"/>
  <rect x="378" y="252" width="50" height="96" rx="6" fill="#ffffff"/>
  <rect x="378" y="252" width="12" height="96" rx="4" fill="#64748b"/>
</svg>`;

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(dir, `icon-${size}.png`));
  console.log("icon", size);
}
