/**
 * Hover a bar and screenshot the tooltip (for verifying the sparkline).
 * Usage: node scripts/hover-shot.mjs <url> <out> [width] [barIndex]
 */
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = join(homedir(), '.cache', 'ms-playwright');
  const dir = readdirSync(base).find((d) => d.startsWith('chromium-') && !d.includes('headless'));
  if (!dir) throw new Error('Chromium not found');
  return join(base, dir, 'chrome-linux64', 'chrome');
}

const url = process.argv[2] ?? 'http://localhost:8787/';
const out = process.argv[3] ?? '/tmp/hover.png';
const width = Number(process.argv[4]) || 900;
const barIndex = Number(process.argv[5]) || 89; // 最新日(右端)

const browser = await chromium.launch({ executablePath: findChromium() });
try {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  const bars = page.locator('.bar-wrap');
  const n = await bars.count();
  await bars.nth(Math.min(barIndex, n - 1)).hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out });
  console.log(`saved ${out} (bars=${n})`);
} finally {
  await browser.close();
}
