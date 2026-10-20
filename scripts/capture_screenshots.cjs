#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.route('**/*', route => /^(file|data|blob):/.test(route.request().url()) ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'networkidle' });
    const snapshot = await page.evaluate(() => {
      GibbsLab.reset({ mode: 'dipole_AB', nPerSide: 24, temp: 1, coupling: 1.5, seed: 17 });
      GibbsLab.step(200);
      GibbsLab.openPartition();
      document.getElementById('run').click();
      GibbsLab.step(4000);
      return GibbsLab.simulation.snapshot();
    });
    for (const [name, width] of [['desktop', 1440], ['tablet', 768], ['mobile', 375]]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(root, 'results', `browser-${name}.png`), fullPage: true });
      await page.screenshot({ path: `/tmp/gibbs-${name}-top.png` });
    }
    await page.locator('.controls').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/gibbs-mobile-controls.png' });
    fs.writeFileSync(path.join(root, 'results', 'screenshots.json'), JSON.stringify({ generatedAt: new Date().toISOString(), protocol: { closedSweeps: 200, openSweeps: 4000 }, snapshot }, null, 2) + '\n');
    console.log('Saved desktop, tablet and mobile screenshots of the same paused seed-17 sample.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
