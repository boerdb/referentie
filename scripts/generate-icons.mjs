import { mkdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

/**
 * PWA-iconen (192 en 512 px) uit public/icons/icon.svg. Draait ook bij `npm install`;
 * het ontwerp staat daarom alleen in icon.svg, zodat de PNG's er altijd mee overeenkomen.
 * (Voorheen stond hier een eigen, oud ontwerp dat bij elke deploy het nieuwe icoon overschreef.)
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "public", "icons");
mkdirSync(dir, { recursive: true });

const svg = readFileSync(path.join(dir, "icon.svg"));

for (const size of [192, 512]) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(path.join(dir, `icon-${size}.png`));
  console.log("icon", size);
}
