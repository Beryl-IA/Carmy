// Génère les PNG de l'icône à partir de public/icons/icon.svg (nécessite Playwright).
// Usage : npm run icons
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = (f) => new URL(`../public/icons/${f}`, import.meta.url).pathname;

const targets = [
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  // Variante "maskable" : le motif tient dans la zone de sécurité (80 %).
  { file: 'icon-maskable-512.png', size: 512, scale: 0.78 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;background:#D9532B;display:grid;place-items:center;width:${t.size}px;height:${t.size}px;overflow:hidden">
    <div style="width:${t.size * t.scale}px;height:${t.size * t.scale}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: out(t.file), omitBackground: false });
}
await browser.close();
console.log('Icônes générées.');
