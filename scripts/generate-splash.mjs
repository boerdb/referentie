#!/usr/bin/env node
/**
 * Opstartschermen voor de PWA op iPhone en iPad (apple-touch-startup-image).
 * Donkerblauw verloop zoals het app-icoon, met het documentlogo precies in het midden.
 * In de app neemt components/pwa/SplashOverlay.tsx dit beeld over (zelfde logo, zelfde plek).
 *
 *   npm run splash:generate     # schrijft public/splash/*.jpg en lib/pwa/splash-screens.json
 *
 * Niet in postinstall: de beelden staan in git, zodat de server ze niet hoeft te maken.
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "splash");
mkdirSync(outDir, { recursive: true });

/** Logo-vlak in CSS-pixels; moet gelijk zijn aan LOGO_SIZE in SplashOverlay.tsx. */
const LOGO_CSS = 168;

/** [CSS-breedte, CSS-hoogte, pixelratio, naam] in staande stand. */
const DEVICES = [
  [440, 956, 3, "iPhone 16/17 Pro Max"],
  [420, 912, 3, "iPhone Air"],
  [402, 874, 3, "iPhone 16/17 Pro"],
  [430, 932, 3, "iPhone 14 Pro Max – 16 Plus"],
  [393, 852, 3, "iPhone 14 Pro – 16"],
  [428, 926, 3, "iPhone 12–14 Pro Max / Plus"],
  [390, 844, 3, "iPhone 12–14"],
  [375, 812, 3, "iPhone X – 13 mini"],
  [414, 896, 3, "iPhone XS Max / 11 Pro Max"],
  [414, 896, 2, "iPhone XR / 11"],
  [375, 667, 2, "iPhone SE / 8"],
  [1032, 1376, 2, "iPad Pro 13\""],
  [1024, 1366, 2, "iPad Pro 12.9\""],
  [834, 1210, 2, "iPad Pro 11\" (M4)"],
  [834, 1194, 2, "iPad Pro 11\""],
  [820, 1180, 2, "iPad Air"],
  [810, 1080, 2, "iPad 10.2\""],
  [744, 1133, 2, "iPad mini"],
];

/** Document met bladwijzer uit public/icons/icon.svg (512-raster), zonder de blauwe tegel. */
const GLYPH = `
  <g transform="rotate(-8 256 270)" opacity="0.35">
    <rect x="150" y="118" width="212" height="276" rx="26" fill="#ffffff"/>
  </g>
  <path d="M168 108 h140 l64 64 v214 a26 26 0 0 1 -26 26 h-178 a26 26 0 0 1 -26 -26 v-252 a26 26 0 0 1 26 -26 z" fill="#ffffff"/>
  <path d="M308 108 v42 a22 22 0 0 0 22 22 h42 z" fill="#c7d2fe"/>
  <rect x="186" y="214" width="150" height="16" rx="8" fill="#c7d2fe"/>
  <rect x="186" y="252" width="150" height="16" rx="8" fill="#c7d2fe"/>
  <rect x="186" y="290" width="104" height="16" rx="8" fill="#c7d2fe"/>
  <rect x="186" y="336" width="62" height="16" rx="8" fill="#2f4fd8"/>
  <path d="M196 108 h52 v104 l-26 -22 l-26 22 z" fill="#f59e0b"/>`;

function splashSvg(w, h, dpr) {
  const logo = LOGO_CSS * dpr;
  const scale = logo / 512;
  // Het document staat in het 512-raster rond (261, 260); zo komt het visueel in het midden.
  const tx = w / 2 - 261 * scale;
  const ty = h / 2 - 260 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#4f6cf7"/>
      <stop offset="1" stop-color="#1e2f8f"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="${8 * dpr}" stdDeviation="${12 * dpr}" flood-color="#0b1450" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})" filter="url(#shadow)">${GLYPH}</g>
</svg>`;
}

const screens = [];
for (const [cw, ch, dpr, name] of DEVICES) {
  const w = cw * dpr;
  const h = ch * dpr;
  const file = `splash-${w}x${h}.jpg`;
  await sharp(Buffer.from(splashSvg(w, h, dpr)))
    // JPEG: een zacht verloop is als PNG 5–10× groter. iOS accepteert JPEG als opstartbeeld.
    .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toFile(path.join(outDir, file));
  screens.push({
    url: `/splash/${file}`,
    media: `(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
    name,
  });
  console.log("splash", name, `${w}x${h}`);
}

writeFileSync(path.join(root, "lib", "pwa", "splash-screens.json"), `${JSON.stringify(screens, null, 2)}\n`);
console.log(`${screens.length} opstartschermen → public/splash/`);
