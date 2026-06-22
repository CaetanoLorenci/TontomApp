// Gera os ícones do PWA (Amplia Hub) a partir da marca sonar, em PNG, via sharp.
// Marca: ponto que emite ondas (sonar) laranja #fc4900 sobre preto #000.
// Rodar: node scripts/gen-icons.mjs  (saída em public/)
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");
mkdirSync(out, { recursive: true });

const INK = "#000000";
const SIGNAL = "#fc4900";

// Marca sonar centrada num quadrado `size`, com `scale` (0–1) do conteúdo (safe zone).
// bg=true desenha fundo preto cheio (full-bleed) — necessário p/ maskable.
function markSvg(size, { scale = 0.62, rounded = false, bg = true } = {}) {
  // A marca nativa vive num viewBox 0 0 32 32. Centramos e escalamos.
  const content = 32; // unidades da marca
  const target = size * scale;
  const k = target / content;
  // Centro óptico: a marca puxa p/ direita (ondas), então desloco o grupo p/ esquerda.
  const tx = (size - target) / 2 - size * 0.04;
  const ty = (size - target) / 2;
  const radius = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg ? `<rect width="${size}" height="${size}" ${rounded ? `rx="${radius}" ry="${radius}"` : ""} fill="${INK}"/>` : ""}
  <g transform="translate(${tx} ${ty}) scale(${k})">
    <circle cx="13" cy="16" r="3.2" fill="${SIGNAL}"/>
    <path d="M19 10.5a7.5 7.5 0 0 1 0 11" stroke="${SIGNAL}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="0.78"/>
    <path d="M23 7a13 13 0 0 1 0 18" stroke="${SIGNAL}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="0.4"/>
  </g>
</svg>`;
}

async function render(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(out, file));
  console.log("✓", file);
}

await render(markSvg(192, { scale: 0.64 }), 192, "icon-192.png");
await render(markSvg(512, { scale: 0.64 }), 512, "icon-512.png");
// Maskable: conteúdo dentro de ~62% (safe zone do Android), fundo preto cheio.
await render(markSvg(512, { scale: 0.56 }), 512, "icon-maskable-512.png");
// Apple touch icon: cantos arredondados ficam por conta do iOS, mas damos um respiro.
await render(markSvg(180, { scale: 0.6 }), 180, "apple-touch-icon.png");
console.log("Pronto.");
