// Browser tests of the built site (Playwright; run in CI on Chromium, Firefox and WebKit).
//   node tools/build.js _site && npx playwright test -c tests/e2e
// Each browser runs the in-page smoke test (tests/e2e/smoke.js) at desktop and phone width and keeps
// screenshots of a few pages in light and dark mode as CI artifacts.
const { test, expect } = require('@playwright/test');
const path = require('path');

const SMOKE = path.join(__dirname, 'smoke.js');

async function open(page, hash) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html' + (hash || ''));
  await page.waitForFunction(() => window.NC && window.NC.calculators && document.querySelector('#main').children.length > 0);
  return errors;
}

for (const size of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 375, height: 812 }]) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('smoke test: every calculator, search, designer, protocols, projects', async ({ page }) => {
      test.setTimeout(15 * 60 * 1000);
      const errors = await open(page, '#/');
      await page.addScriptTag({ path: SMOKE });
      // calculators are checked at desktop width only (the phone pass checks layout of the other pages)
      const r = await page.evaluate((all) => window.NCSmoke({ calculators: all }), size.name === 'desktop');
      console.log(size.name, JSON.stringify(r.stats));
      expect(r.failures, r.failures.join('\n')).toEqual([]);
      expect(errors, errors.join('\n')).toEqual([]);
    });

    test('phone: inputs and results switch, result bar', async ({ page }) => {
      test.skip(size.name !== 'phone');
      await open(page, '#/calc/scherrer');
      await page.click('#exBtn');
      await expect(page.locator('#wsBar')).toBeVisible();
      await page.click('#wsBar');
      await expect(page.locator('.ws-out')).toBeVisible();
      await expect(page.locator('.ws-inputs')).toBeHidden();
    });

    test('screenshots (light and dark)', async ({ page }, info) => {
      for (const scheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const [name, hash] of [['home', '#/'], ['mie', '#/calc/mie'], ['designer', '#/design'], ['protocol', '#/synthesis/citrate-gold']]) {
          await open(page, hash);
          await page.waitForTimeout(600);
          await page.screenshot({ path: info.outputPath(size.name + '-' + scheme + '-' + name + '.png'), fullPage: false });
        }
      }
    });
  });
}

test('search opens with Ctrl+K and goes to a protocol with Enter', async ({ page }) => {
  await open(page, '#/');
  await page.keyboard.press('Control+k');
  await expect(page.locator('#search')).toBeFocused();
  await page.keyboard.type('stober');
  await expect(page.locator('#searchPanel .search-hit').first()).toContainText('Stöber');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/synthesis\/stober-silica/);
});

test('a decimal in a whole-number field is flagged and snapped', async ({ page }) => {
  await open(page, '#/calc/graphene');
  const n = page.locator('#f-N');
  await n.fill('2.5');
  await expect(page.locator('[data-field="N"] .field-msg')).toHaveText('Must be a whole number.');
  await n.blur();
  await expect(n).toHaveValue('3');
});
