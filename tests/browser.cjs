#!/usr/bin/env node
'use strict';

// Offline browser acceptance checks. NODE_PATH can point to the bundled
// Playwright installation; no package download or local server is required.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'results');
const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, passed: !!condition, detail });
  assert.ok(condition, `${name}: ${detail}`);
}
async function run() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  const externalRequests = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^(file|data|blob):/.test(url)) return route.continue();
    externalRequests.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.GibbsLab?.simulation);
    check('starts paused with closed partition', await page.evaluate(() => !GibbsLab.running && !GibbsLab.simulation.partitionOpen));
    for (const mode of ['ideal_AA', 'ideal_AB', 'dipole_AA', 'dipole_AB']) {
      await page.selectOption('#mode', mode);
      check(`${mode}: mode change resets to paused`, await page.evaluate(() => !GibbsLab.running && GibbsLab.simulation.sweeps === 0));
      await page.click('#openPartition');
      await page.waitForFunction(() => GibbsLab.simulation.sweeps > 0);
      check(`${mode}: removing wall runs simulation`, await page.evaluate(() => GibbsLab.running && GibbsLab.simulation.partitionOpen));
      await page.click('#run');
      const pausedAt = await page.evaluate(() => GibbsLab.simulation.sweeps);
      await page.waitForTimeout(150);
      check(`${mode}: pause stops sampling`, await page.evaluate(expected => !GibbsLab.running && GibbsLab.simulation.sweeps === expected, pausedAt));
      await page.evaluate(() => GibbsLab.step(20));
      const metrics = await page.evaluate(() => GibbsLab.simulation.metrics());
      check(`${mode}: finite physics metrics`, Number.isFinite(metrics.energyPerParticle) && Number.isFinite(metrics.mixingPerParticle));
      await page.click('#reset');
      check(`${mode}: reset closes wall and clears sweeps`, await page.evaluate(() => !GibbsLab.running && !GibbsLab.simulation.partitionOpen && GibbsLab.simulation.sweeps === 0));
    }
    await page.fill('#seed', '1729');
    await page.locator('#seed').dispatchEvent('change');
    await page.evaluate(() => GibbsLab.step(30));
    const seeded = await page.evaluate(() => JSON.stringify(GibbsLab.simulation.particles));
    await page.click('#reset');
    await page.evaluate(() => GibbsLab.step(30));
    check('seed reproduces particle coordinates', seeded === await page.evaluate(() => JSON.stringify(GibbsLab.simulation.particles)));

    for (const [id, value] of [['nPerSide', '32'], ['temp', '1.2'], ['coupling', '0.8']]) {
      await page.locator(`#${id}`).evaluate((input, newValue) => {
        input.value = newValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      check(`${id}: parameter change resets sampling`, await page.evaluate(() => !GibbsLab.running && GibbsLab.simulation.sweeps === 0));
      check(`${id}: parameter reaches physics model`, await page.evaluate(({ key, expected }) => GibbsLab.simulation.config[key] === expected, { key: id, expected: Number(value) }));
    }
    await page.click('#advance');
    await page.waitForFunction(() => !GibbsLab.running && GibbsLab.simulation.sweeps === 100);
    check('advance performs 100 sweeps and pauses', true);

    for (const [selector, extension] of [['#exportCSV', '.csv'], ['#exportJSON', '.json'], ['#exportPNG', '.png']]) {
      const promise = page.waitForEvent('download');
      await page.click(selector);
      const download = await promise;
      check(`${extension}: export download offered`, download.suggestedFilename().endsWith(extension));
      const downloadPath = await download.path();
      check(`${extension}: export has content`, fs.statSync(downloadPath).size > 50);
      if (extension === '.json') check('JSON export parses', !!JSON.parse(fs.readFileSync(downloadPath, 'utf8')));
      if (extension === '.png') check('PNG export signature', fs.readFileSync(downloadPath).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    }
    await page.selectOption('#mode', 'ideal_AA');
    const beforeTags = await page.evaluate(() => JSON.stringify(GibbsLab.simulation.snapshot()));
    await page.locator('#showOrigins').setChecked(!(await page.locator('#showOrigins').isChecked()));
    check('AA origin color toggle leaves physical state unchanged', beforeTags === await page.evaluate(() => JSON.stringify(GibbsLab.simulation.snapshot())));
    check('Einstein default M=4 q=4 has 35 allocations', (await page.locator('#omegaValue').textContent()).replaceAll(',', '') === '35');
    await page.evaluate(() => {
      document.getElementById('oscillators').value = 8;
      document.getElementById('quanta').value = 12;
      document.getElementById('quanta').dispatchEvent(new Event('input', { bubbles: true }));
    });
    check('Einstein M=8 q=12 has 50388 allocations', (await page.locator('#omegaValue').textContent()).replaceAll(',', '') === '50388');
    await page.evaluate(() => {
      document.getElementById('quanta').value = 0;
      document.getElementById('quanta').dispatchEvent(new Event('input', { bubbles: true }));
    });
    check('Einstein q=0 has one allocation', (await page.locator('#omegaValue').textContent()).replaceAll(',', '') === '1');
    await page.evaluate(() => {
      document.getElementById('quanta').value = 12;
      document.getElementById('quanta').dispatchEvent(new Event('input', { bubbles: true }));
    });
    for (const width of [1440, 768, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(150);
      const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, canvases: [...document.querySelectorAll('canvas')].map(canvas => ({ width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height })) }));
      check(`${width}px: no horizontal overflow`, geometry.document <= width + 1 && geometry.body <= width + 1, JSON.stringify(geometry));
      check(`${width}px: canvases remain visible`, geometry.canvases.every(canvas => canvas.width > 0 && canvas.height > 0));
      const detailsState = await page.evaluate(() => [...document.querySelectorAll('details')].map(detail => { const state = detail.open; detail.open = true; return state; }));
      const expandedGeometry = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      check(`${width}px: expanded explanations have no overflow`, expandedGeometry.document <= width + 1 && expandedGeometry.body <= width + 1, JSON.stringify(expandedGeometry));
      await page.evaluate(states => document.querySelectorAll('details').forEach((detail, index) => { detail.open = states[index]; }), detailsState);
    }
    check('reduced motion preference active', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
    check('fully offline: no external requests', externalRequests.length === 0, externalRequests.join(', '));
    check('no browser console or runtime errors', errors.length === 0, errors.join('; '));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.selectOption('#mode', 'dipole_AB');
    await page.evaluate(() => { GibbsLab.simulation.setPartition(true); GibbsLab.step(200); });
    await page.screenshot({ path: '/tmp/gibbs-browser-check-state.png', fullPage: true });
  } finally {
    await browser.close();
    const summary = { generatedAt: new Date().toISOString(), browser: 'Chromium', offline: true, reducedMotion: 'reduce', passed: checks.filter(check => check.passed).length, total: checks.length, checks, errors, externalRequests };
    fs.writeFileSync(path.join(out, 'browser-checks.json'), JSON.stringify(summary, null, 2) + '\n');
  }
  process.stdout.write(`${checks.filter(check => check.passed).length}/${checks.length} browser checks passed.\n`);
}
run().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
