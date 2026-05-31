/**
 * Capture a full-page screenshot of a URL for visual verification.
 *
 * Usage: node scripts/screenshot.mjs [url] [outfile]
 *   defaults: http://localhost:8787/  ->  /tmp/hc-shot.png
 *
 * Uses the Chromium already cached by Playwright (no extra download). Override
 * the binary with CHROMIUM_PATH if needed.
 */
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = join(homedir(), '.cache', 'ms-playwright');
  const dir = readdirSync(base).find((d) => d.startsWith('chromium-') && !d.includes('headless'));
  if (!dir) throw new Error('Chromium not found in Playwright cache; set CHROMIUM_PATH');
  return join(base, dir, 'chrome-linux64', 'chrome');
}

const url = process.argv[2] ?? 'http://localhost:8787/';
const out = process.argv[3] ?? '/tmp/hc-shot.png';
const width = Number(process.argv[4]) || 900;

const browser = await chromium.launch({ executablePath: findChromium() });
try {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: out, fullPage: true });
  console.log(`saved ${out}`);
} finally {
  await browser.close();
}
