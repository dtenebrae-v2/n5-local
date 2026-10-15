// End-to-end checks against a fresh local server and an isolated browser profile.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const addWordChecks = require('./add-word.cjs');
const readline = require('node:readline');
const { chromium } = require('playwright');
const gameChecks = require('./game.cjs');
const vocabularyGameChecks = require('./vocabulary-game.cjs');
const practiceChecks = require('./practice.cjs');

const root = path.resolve(__dirname, '..');
const serverCode = `
from http.server import ThreadingHTTPServer
from server import Handler
with ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server:
    print(server.server_port, flush=True)
    server.serve_forever()
`;

async function main() {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'n5-ui-'));
  const server = spawn(process.env.PYTHON || 'python3', ['-u', '-c', serverCode], {
    cwd: root,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', N5_VOCABULARY: path.join(storage, 'vocabulary.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stderr.on('data', (chunk) => { logs += chunk; });
  let browser;
  let startupTimer;
  try {
    const lines = readline.createInterface({ input: server.stdout });
    const port = await new Promise((resolve, reject) => {
      startupTimer = setTimeout(() => reject(new Error('Server startup timed out: ' + logs)), 10000);
      lines.once('line', (line) => resolve(Number(line)));
      server.once('error', reject);
      server.once('exit', () => reject(new Error('Server exited: ' + logs)));
    });
    clearTimeout(startupTimer);
    lines.close();
    const systemBrowser = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome']
      .find((candidate) => fs.existsSync(candidate));
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_PATH || systemBrowser,
      headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const base = `http://127.0.0.1:${port}`;
    const catalog = await (await page.request.get(base + '/api/catalog')).json();

    async function ready() {
      await page.waitForSelector('#results[aria-busy="false"]');
    }
    async function open(url) {
      await page.goto(base + url);
      await ready();
    }
    async function resultFor(query) {
      const response = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === '/api/words' && url.searchParams.get('q') === query;
      });
      await page.locator('#word-search').fill(query);
      await response;
      await ready();
    }

    await page.goto(base + '/jlpt/n5');
    await ready();
    assert.equal(await page.title(), 'Все слова · N5');
    assert.equal(new URL(page.url()).pathname, '/jlpt/n5/vocabulary/complete');
    assert.equal(await page.locator('.hero, footer, .sidebar-note').count(), 0);
    assert.doesNotMatch(await page.locator('#navigation').innerText(), /Обзор курса/);
    assert.equal(await page.locator('tbody tr').count(), 60);
    assert.match(await page.locator('#navigation').innerText(), /Существительные\s+439/);
    console.log('PASS home, catalog navigation and titles');

    await page.keyboard.press('/');
    await ready();
    assert.equal(await page.locator('#word-search').evaluate((input) => input === document.activeElement), true);
    await page.locator('#navigation a[href$="/vocabulary/nouns"]').click();
    await ready();
    assert.equal(await page.title(), 'Существительные · N5');
    assert.match(await page.locator('#result-count').innerText(), /Найдено 439/);
    assert.equal(await page.locator('tbody tr').count(), 60);
    const first = await page.locator('.japanese-word').first().innerText();
    await page.locator('#next').click();
    await page.waitForFunction(() => location.search.includes('offset=60'));
    await ready();
    assert.notEqual(await page.locator('.japanese-word').first().innerText(), first);
    await page.locator('#previous').click();
    await ready();
    assert.equal(await page.locator('.japanese-word').first().innerText(), first);
    console.log('PASS keyboard shortcut, nouns and pagination');

    await resultFor('water');
    assert.match(await page.locator('#results').innerText(), /water/i);
    assert.match(await page.locator('#download').getAttribute('href'), /q=water/);
    assert.equal(await page.locator('#reading').count(), 0);
    assert.equal(await page.locator('td.reading-col').first().isVisible(), true);
    assert.equal(await page.getByText('Значения на английском', { exact: true }).count(), 0);
    assert.equal(await page.locator('.vocabulary-panel > .practice-help').count(), 0);
    await resultFor('nonexistentword12345');
    await page.locator('#reset-search').click();
    await ready();
    await page.locator('[data-group="nouns:people"]').click();
    await ready();
    assert.equal(await page.locator('[data-group="nouns:people"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.word-group-card').count(), 1);
    assert.equal(await page.locator('.word-group-header h2').innerText(), 'Люди и семья');
    const filteredURL = page.url();
    await page.locator('#navigation a[href$="/grammar/nouns"]').click();
    await page.waitForSelector('.lesson');
    await page.goBack();
    await ready();
    assert.equal(page.url(), filteredURL);
    assert.equal(await page.locator('[data-group="nouns:people"]').getAttribute('aria-pressed'), 'true');
    console.log('PASS search, always-visible readings, reset, groups and history');

    for (const item of [...catalog.collections, ...catalog.sections, ...catalog.lessons]) {
      await page.goto(base + item.path);
      await page.waitForFunction((title) => document.title === title, `${item.label} · N5`);
      if (catalog.collections.includes(item)) await ready();
      else await page.waitForSelector(catalog.sections.includes(item) ? '.collection-card' : '.lesson');
    }
    await open('/jlpt/n5/vocabulary/i-adjectives');
    assert.equal(await page.locator('.group-tile').count(), 11);
    assert.equal(await page.locator('.word-group-card').count(), 10);
    assert.equal(await page.locator('.word-group-header h2').first().innerText(), 'Цвета');
    if (process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'n5-topics.png') });
    }
    await page.locator('.group-tile').filter({ hasText: 'Цвета' }).click();
    await ready();
    assert.equal(await page.locator('.word-group-card').count(), 1);
    assert.equal(await page.locator('tbody tr').count(), 5);
    await open('/jlpt/n5/vocabulary/nouns?offset=999999');
    assert.match(await page.locator('#result-count').innerText(), /421–439/);
    await open('/jlpt/n5/vocabulary/nouns?offset=Infinity');
    assert.match(await page.locator('#result-count').innerText(), /1–60/);
    console.log('PASS all collection/grammar routes and invalid offsets');

    // Hold one search until a newer search completes; stale results must not appear.
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let started;
    const intercepted = new Promise((resolve) => { started = resolve; });
    const delayedSearch = async (route) => {
      if (new URL(route.request().url()).searchParams.get('q') === 'school') {
        started();
        await gate;
      }
      await route.continue().catch(() => {});
    };
    await page.route('**/api/words?*', delayedSearch);
    await page.locator('#word-search').fill('school');
    await intercepted;
    await resultFor('water');
    release();
    await page.unroute('**/api/words?*', delayedSearch);
    assert.match(await page.locator('#results').innerText(), /water/i);
    assert.doesNotMatch(await page.locator('#results').innerText(), /school/i);
    console.log('PASS superseded search cancellation');

    let finishNavigationRequest;
    const navigationGate = new Promise((resolve) => { finishNavigationRequest = resolve; });
    let navigationRequestStarted;
    const navigationIntercepted = new Promise((resolve) => { navigationRequestStarted = resolve; });
    const delayedNavigation = async (route) => {
      navigationRequestStarted();
      await navigationGate;
      await route.continue().catch(() => {});
    };
    await page.route('**/api/words?*', delayedNavigation);
    await page.locator('#word-search').fill('school');
    await navigationIntercepted;
    await page.locator('#navigation a[href$="/grammar/nouns"]').click();
    await page.waitForSelector('.lesson');
    finishNavigationRequest();
    await page.unroute('**/api/words?*', delayedNavigation);
    assert.equal(await page.title(), 'Существительные и частицы · N5');
    assert.equal(await page.locator('#word-search').count(), 0);
    console.log('PASS navigation cancels requests from the previous page');


    await practiceChecks(page, base);
    await gameChecks(page, base);
    await vocabularyGameChecks(page, base);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/jlpt/n5');
    await ready();
    await page.locator('.menu-toggle').click();
    assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
    await page.locator('#navigation a[href$="/vocabulary/nouns"]').click();
    await ready();
    assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'n5-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(base + '/jlpt/n5');
      await ready();
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'n5-home.png'), fullPage: true });
    }
    await addWordChecks(page, base);
    assert.deepEqual(errors, []);
    console.log('PASS mobile navigation, layout and no JavaScript errors');
  } finally {
    clearTimeout(startupTimer);
    await browser?.close();
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    fs.rmSync(storage, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
