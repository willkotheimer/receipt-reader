import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Portfolio screenshots and the walkthrough video, captured from the running app.
 *
 * An asset produced by a script cannot drift from what the product does; one cropped by hand
 * silently can. So every shot here is the real UI, and — unlike the rest of this suite —
 * against the real Document Intelligence model. A walkthrough that stubbed the model would
 * be showing something the app does not do.
 *
 * Opted into, never automatic. Without CAPTURE the whole file skips, so `npm test` and CI
 * are unaffected: this writes outside the repository and calls a metered service, neither of
 * which a test run should do by surprise.
 *
 * ```bash
 * CAPTURE=1 \
 *   DocumentIntelligence__Endpoint="https://cog-rcpt-dev-v73tchkn.cognitiveservices.azure.com/" \
 *   SHOT_DIR=../../../firebase-portfolio-site/public/screenshots \
 *   npx playwright test capture
 * ```
 *
 * Each run spends four pages of the F0 tier's 500/month.
 *
 * Governance-Ref: SECTION-9
 */

const OUT = resolve(process.env.SHOT_DIR ?? 'screenshots');
const FIXTURES = resolve('../fixtures/receipts');

/** As photographed: sideways, creased. The model scores it 0.258 and the app refuses it. */
const SIDEWAYS = `${FIXTURES}/primark-franklin-tn.jpg`;

/** The same receipt rotated upright. Same paper, same creases, and it reads. */
const UPRIGHT = `${FIXTURES}/primark-franklin-tn-upright.jpg`;

// File level, not inside the describe: Playwright rejects `video` in a describe group
// because recording forces a new worker. The viewport rides along here for the same reason —
// the chromium project spreads devices['Desktop Chrome'], whose own viewport otherwise lands
// after the config's `use` block and quietly wins.
// 1000x626 is 16:10, which every other walkthrough on the portfolio uses. A previous
// capture at 1280x620 was 2.06:1 and rendered visibly squashed beside its neighbours — the
// board reads as one thing, so the aspect ratio is not a free choice.
//
// The width also matters: the app's content is capped at 60rem, so 1000 fills the frame
// while 1280 left a margin down both sides.
test.use({
  viewport: { width: 1000, height: 626 },
  video: { mode: 'on', size: { width: 1000, height: 626 } },
});

test.describe('capture', () => {
  test.skip(!process.env.CAPTURE, 'set CAPTURE=1 to write portfolio media');

  // The shots are a sequence: the receipt added in one is what makes the next worth looking
  // at, and localStorage carries it between them only within a single browser context.
  //
  // The timeout is raised well past Playwright's 30s default because each test makes two
  // round trips to a real remote model. The individual expects already allow 60s each, which
  // the test timeout was silently capping — it passed only while the service happened to be
  // fast, and failed the first time it was not.
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true });
  });

  async function shot(page: Page, name: string) {
    await page.screenshot({ path: `${OUT}/${name}.jpg`, quality: 84, type: 'jpeg' });
  }

  async function upload(page: Page, file: string) {
    // Two steps now: choosing a file no longer starts the analysis.
    await page.getByLabel('Receipt image or PDF').setInputFiles(file);
    await page.getByRole('button', { name: /read receipt/i }).click();
  }

  test('screenshots', async ({ page }) => {
    // Shorter than the walkthrough viewport. The app is a heading, an input and a table; at
    // 800 tall the bottom half of every shot is empty page, which reads as an unfinished
    // screen rather than a small one.
    // Stills sit in a 16:10 grid on the case page, so they match the walkthrough's shape
    // rather than the viewport that happens to be convenient.
    await page.setViewportSize({ width: 1000, height: 626 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Receipt Reader' })).toBeVisible();
    await expect(page.getByText(/no receipts yet/i)).toBeVisible();
    await shot(page, 'rr_empty');

    // The fail-closed path, driven by the real model rather than a stub: this receipt
    // genuinely scores below the confidence threshold.
    await upload(page, SIDEWAYS);
    await expect(page.getByRole('alert')).toHaveText('Unable to process document.', {
      timeout: 60_000,
    });
    await shot(page, 'rr_failclosed');

    // Same receipt, rotated upright.
    await upload(page, UPRIGHT);
    await expect(page.getByText('PRIMARK')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('$10.00').first()).toBeVisible();
    await shot(page, 'rr_extracted');

    // Reload proves the receipt is held client-side: the server kept nothing.
    await page.reload();
    await expect(page.getByText('PRIMARK')).toBeVisible();
    await shot(page, 'rr_persisted');
  });

  test('walkthrough', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.getByText(/no receipts yet/i)).toBeVisible();
    await page.waitForTimeout(1800);

    // Refused, and the app says only that it could not be processed.
    await upload(page, SIDEWAYS);
    await expect(page.getByRole('alert')).toHaveText('Unable to process document.', {
      timeout: 60_000,
    });
    await page.waitForTimeout(2600);

    // Rotated upright, the same paper reads.
    await upload(page, UPRIGHT);
    await expect(page.getByText('PRIMARK')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(3200);

    // Still there after a reload, because it never left the browser.
    await page.reload();
    await expect(page.getByText('PRIMARK')).toBeVisible();
    await page.waitForTimeout(2400);

    // And removable, which clears it from localStorage too.
    await page.getByRole('button', { name: /remove/i }).click();
    await expect(page.getByText(/no receipts yet/i)).toBeVisible();
    await page.waitForTimeout(1600);
  });
});
