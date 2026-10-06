#!/usr/bin/env node
/**
 * Gera os ícones do app (favicon, PWA, iOS) a partir de `public/favicon.svg`.
 *
 * Uso (na raiz do repo, depois de `npm ci`):
 *   node frontend/scripts/generate-icons.mjs
 *
 * Usa o `sharp`, que já vem instalado como dependência opcional do `next` — não é preciso
 * acrescentar nada ao package.json. Os binários gerados são commitados; rode de novo só quando o
 * `favicon.svg` mudar. Substitui o antigo `generate_favicons.py` (Pillow, redesenhava outro ícone
 * à mão e apontava para um caminho do Windows).
 *
 * Saídas (em frontend/public/):
 *   favicon.ico                 16/32/48 (entradas PNG dentro do ICO)
 *   icons/icon-192.png          purpose "any" (cantos arredondados, fundo transparente)
 *   icons/icon-512.png          purpose "any"
 *   icons/icon-maskable-512.png purpose "maskable" (fundo até a borda, desenho dentro do círculo
 *                               seguro de 80% — o Android recorta em círculo/squircle)
 *   apple-touch-icon.png        180, fundo até a borda (o iOS arredonda sozinho e pinta de preto
 *                               o que for transparente)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const source = readFileSync(join(PUBLIC_DIR, 'favicon.svg'), 'utf8');

function replaceOnce(svg, from, to) {
  if (!svg.includes(from)) {
    throw new Error(`favicon.svg mudou: trecho esperado não encontrado: ${from}`);
  }
  return svg.replace(from, to);
}

/** Fundo quadrado até a borda (sem os cantos arredondados de 108px). */
function fullBleed(svg) {
  return svg.replaceAll('rx="108" ry="108"', 'rx="0" ry="0"');
}

/** Encolhe o bilhete para caber no círculo seguro do ícone maskable (raio 40% = 204,8px). */
function maskable(svg) {
  return replaceOnce(
    fullBleed(svg),
    '<g transform="translate(256,250)" filter="url(#shadow)">',
    '<g transform="translate(256,254) scale(0.78)" filter="url(#shadow)">',
  );
}

async function png(svg, size) {
  // Rasteriza o SVG (viewBox 512) já na resolução final, com folga de 2x para o antialiasing.
  const density = Math.max(72, Math.ceil((72 * size * 2) / 512));
  return sharp(Buffer.from(svg), { density }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

/** Monta um .ico com entradas PNG (suportado por todos os navegadores e pelo Windows Vista+). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo 1 = ícone
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); // largura
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1); // altura
    dir.writeUInt8(0, o + 2); // paleta
    dir.writeUInt8(0, o + 3); // reservado
    dir.writeUInt16LE(1, o + 4); // planos
    dir.writeUInt16LE(32, o + 6); // bits por pixel
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

async function main() {
  mkdirSync(join(PUBLIC_DIR, 'icons'), { recursive: true });
  const outputs = [
    ['icons/icon-192.png', source, 192],
    ['icons/icon-512.png', source, 512],
    ['icons/icon-maskable-512.png', maskable(source), 512],
    ['apple-touch-icon.png', fullBleed(source), 180],
  ];
  for (const [file, svg, size] of outputs) {
    writeFileSync(join(PUBLIC_DIR, file), await png(svg, size));
    console.log(`ok  ${file} (${size}x${size})`);
  }
  const icoEntries = [];
  for (const size of [16, 32, 48]) {
    icoEntries.push({ size, data: await png(source, size) });
  }
  writeFileSync(join(PUBLIC_DIR, 'favicon.ico'), buildIco(icoEntries));
  console.log('ok  favicon.ico (16, 32, 48)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
