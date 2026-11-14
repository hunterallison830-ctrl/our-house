// House-number memory: prompt once per browser, remember a valid code, reject invalid ones.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.APP_URL || 'http://127.0.0.1:8768';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox']
});
const results = [];
async function test(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({name, pass: true, durationMs: Date.now() - start});
  } catch (error) {
    results.push({name, pass: false, durationMs: Date.now() - start, error: String(error)});
    throw error;
  }
}
async function context() {
  return browser.newContext({
    viewport: {width: 390, height: 844},
    timezoneId: 'America/New_York',
    serviceWorkers: 'block'
  });
}
async function open(ctx, path = base) {
  const page = await ctx.newPage();
  await page.goto(path, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading').first().waitFor();
  return page;
}
async function stored(page) {
  return page.evaluate(() => {
    const cookie = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('our-house-number='));
    return {
      local: localStorage.getItem('our-house-number'),
      cookie: cookie ? decodeURIComponent(cookie.slice('our-house-number='.length)) : null
    };
  });
}
const welcome = page => page.getByRole('heading', {name: 'Welcome to Our House'}).waitFor();
const home = page => page.getByRole('heading', {name: 'Grandma and Grandpa', exact: true}).waitFor();
const click = (page, name) => page.getByRole('button', {name, exact: true}).click();

try {
  await test('A fresh browser with no stored code is asked for a house number', async () => {
    const ctx = await context();
    const page = await open(ctx);
    await welcome(page);
    await click(page, 'I already have a house number');
    await page.getByRole('heading', {name: 'What is your house number?'}).waitFor();
    assert.deepEqual(await stored(page), {local: null, cookie: null});
    await ctx.close();
  });

  await test('Incorrect codes are rejected and not stored', async () => {
    const ctx = await context();
    const page = await open(ctx);
    await click(page, 'I already have a house number');
    for (const code of ['', '12', '000000', '123456']) {
      await page.locator('#house-number').fill(code);
      await click(page, 'Open our house');
      await page.getByRole('alert').filter({hasText: 'Please type your 6-digit house number.'}).waitFor();
      assert.deepEqual(await stored(page), {local: null, cookie: null}, `stored after ${code || 'blank'}`);
      await page.getByRole('heading', {name: 'What is your house number?'}).waitFor();
    }
    await ctx.close();
  });

  await test('A correct code is remembered in localStorage and a cookie; reload and a new visit stay signed in', async () => {
    const ctx = await context();
    const page = await open(ctx);
    await click(page, 'I already have a house number');
    await page.locator('#house-number').fill('482917');
    await click(page, 'Open our house');
    await home(page);
    assert.deepEqual(await stored(page), {local: '482917', cookie: '482917'});

    await page.reload({waitUntil: 'domcontentloaded'});
    await home(page);
    assert.equal(await page.getByRole('heading', {name: 'Welcome to Our House'}).count(), 0);

    const again = await open(ctx);
    await home(again);
    assert.equal(await again.getByRole('heading', {name: 'Welcome to Our House'}).count(), 0);
    assert.deepEqual(await stored(again), {local: '482917', cookie: '482917'});
    await ctx.close();
  });

  await test('A house created on this phone is remembered the same way', async () => {
    const ctx = await context();
    const page = await open(ctx);
    await click(page, 'Create our house');
    const code = (await page.locator('.number').innerText()).trim();
    await click(page, 'Continue');
    await home(page);
    assert.deepEqual(await stored(page), {local: code, cookie: code});
    await page.reload({waitUntil: 'domcontentloaded'});
    await home(page);
    await ctx.close();
  });

  await test('Existing users who already have our-house-number in localStorage stay joined', async () => {
    const ctx = await context();
    await ctx.addInitScript(() => localStorage.setItem('our-house-number', '554740'));
    const page = await open(ctx);
    await home(page);
    assert.equal(await page.getByRole('heading', {name: 'Welcome to Our House'}).count(), 0);
    assert.equal((await stored(page)).local, '554740');
    assert.equal((await stored(page)).cookie, '554740');
    await ctx.close();
  });

  await test('A remembered cookie is enough if localStorage was cleared', async () => {
    const ctx = await context();
    const page = await open(ctx);
    await page.evaluate(() => {
      document.cookie = 'our-house-number=708344;Max-Age=315360000;Path=/;SameSite=Lax';
    });
    await page.evaluate(() => localStorage.removeItem('our-house-number'));
    await page.reload({waitUntil: 'domcontentloaded'});
    await home(page);
    assert.equal((await stored(page)).local, '708344');
    await ctx.close();
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify({pass: results.length > 0 && results.every(r => r.pass), checks: results}, null, 2));
  await browser.close();
}
